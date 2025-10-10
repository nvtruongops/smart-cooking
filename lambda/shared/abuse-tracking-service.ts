/**
 * User Abuse Tracking Service
 * 
 * Tracks user violations and enforces progressive penalties:
 * - Warning 1-2: Soft warning
 * - Warning 3-4: Strong warning  
 * - Warning 5+: Report to admin dashboard
 * - Weekly reset: Violations reset after 7 days
 * 
 * Storage: DynamoDB with TTL for auto-cleanup
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { logger } from '../shared/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AbuseRecord {
  user_id: string;
  violation_type: 'spam_input' | 'sql_injection' | 'xss_attempt' | 'fake_rating' | 'bot_behavior' | 'inappropriate_content';
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: any;
  timestamp: string;
  week_key: string; // Format: YYYY-WW (e.g., 2025-41)
}

export interface AbuseStats {
  total_violations: number;
  this_week_violations: number;
  last_violation: string;
  severity_breakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  should_notify_admin: boolean;
  penalty_level: 'none' | 'warning' | 'restricted' | 'suspended';
}

export interface AdminNotification {
  notification_id: string;
  user_id: string;
  violation_count: number;
  violations: AbuseRecord[];
  created_at: string;
  status: 'pending' | 'reviewed' | 'resolved';
}

export class AbuseTrackingService {
  // Thresholds
  private static readonly ADMIN_NOTIFICATION_THRESHOLD = 5; // Report after 5 violations in a week
  private static readonly AUTO_SUSPEND_THRESHOLD = 10; // Auto-suspend after 10 violations
  private static readonly WEEK_RESET_DAYS = 7; // Reset count after 7 days
  
  // TTL for abuse records (30 days for historical tracking)
  private static readonly RECORD_TTL_DAYS = 30;

  /**
   * Get current week key (YYYY-WW format)
   */
  private static getCurrentWeekKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    
    // Calculate week number (ISO 8601)
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    
    return `${year}-${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Record a violation
   */
  static async recordViolation(
    userId: string,
    violationType: AbuseRecord['violation_type'],
    severity: AbuseRecord['severity'],
    evidence: any
  ): Promise<AbuseStats> {
    const timestamp = new Date().toISOString();
    const weekKey = this.getCurrentWeekKey();
    const violationId = uuidv4();
    
    // Calculate TTL (30 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (this.RECORD_TTL_DAYS * 24 * 60 * 60);

    // Save violation record
    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: `VIOLATION#${timestamp}#${violationId}`,
      entity_type: 'abuse_violation',
      user_id: userId,
      violation_id: violationId,
      violation_type: violationType,
      severity: severity,
      evidence: evidence,
      timestamp: timestamp,
      week_key: weekKey,
      ttl: ttl, // Auto-delete after 30 days
      // GSI for admin dashboard
      GSI1PK: `VIOLATIONS#${weekKey}`,
      GSI1SK: timestamp,
      // GSI2 for severity-based queries
      GSI2PK: `SEVERITY#${severity}`,
      GSI2SK: timestamp,
    });

    logger.warn('Violation recorded', {
      userId,
      violationType,
      severity,
      weekKey,
      violationId,
    });

    // Get updated abuse stats
    const stats = await this.getAbuseStats(userId);

    // Check if should notify admin
    if (stats.should_notify_admin) {
      await this.notifyAdmin(userId, stats);
    }

    // Check if should auto-suspend
    if (stats.this_week_violations >= this.AUTO_SUSPEND_THRESHOLD) {
      await this.autoSuspendUser(userId, stats);
    }

    return stats;
  }

  /**
   * Get abuse statistics for a user
   */
  static async getAbuseStats(userId: string): Promise<AbuseStats> {
    const weekKey = this.getCurrentWeekKey();
    
    // Get all violations for this user
    const allViolationsResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'VIOLATION#',
      },
    });

    const allViolations = allViolationsResult.Items || [];
    
    // Filter violations for this week
    const thisWeekViolations = allViolations.filter(
      (v: any) => v.week_key === weekKey
    );

    // Calculate severity breakdown
    const severityBreakdown = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    thisWeekViolations.forEach((v: any) => {
      severityBreakdown[v.severity as keyof typeof severityBreakdown]++;
    });

    // Determine penalty level
    let penaltyLevel: AbuseStats['penalty_level'] = 'none';
    const weekCount = thisWeekViolations.length;
    
    if (weekCount >= this.AUTO_SUSPEND_THRESHOLD) {
      penaltyLevel = 'suspended';
    } else if (weekCount >= this.ADMIN_NOTIFICATION_THRESHOLD) {
      penaltyLevel = 'restricted';
    } else if (weekCount >= 3) {
      penaltyLevel = 'warning';
    }

    return {
      total_violations: allViolations.length,
      this_week_violations: weekCount,
      last_violation: allViolations[0]?.timestamp || '',
      severity_breakdown: severityBreakdown,
      should_notify_admin: weekCount >= this.ADMIN_NOTIFICATION_THRESHOLD && weekCount < this.AUTO_SUSPEND_THRESHOLD,
      penalty_level: penaltyLevel,
    };
  }

  /**
   * Notify admin dashboard about user violations
   */
  private static async notifyAdmin(userId: string, stats: AbuseStats): Promise<void> {
    const notificationId = uuidv4();
    const timestamp = new Date().toISOString();
    const weekKey = this.getCurrentWeekKey();
    
    // Check if already notified this week
    const existingNotification = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': 'ADMIN_NOTIFICATIONS',
        ':sk': `ABUSE#${weekKey}#${userId}`,
      },
      Limit: 1,
    });

    if (existingNotification.Items && existingNotification.Items.length > 0) {
      logger.info('Admin already notified this week', { userId, weekKey });
      return; // Already notified
    }

    // Get violation details
    const violationsResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'VIOLATION#',
      },
    });

    const violations = violationsResult.Items || [];
    const thisWeekViolations = violations.filter((v: any) => v.week_key === weekKey);

    // Create admin notification
    await DynamoDBHelper.put({
      PK: 'ADMIN_NOTIFICATIONS',
      SK: `ABUSE#${weekKey}#${userId}#${notificationId}`,
      entity_type: 'admin_notification',
      notification_id: notificationId,
      notification_type: 'user_abuse',
      user_id: userId,
      week_key: weekKey,
      violation_count: stats.this_week_violations,
      violations: thisWeekViolations.map((v: any) => ({
        type: v.violation_type,
        severity: v.severity,
        timestamp: v.timestamp,
      })),
      severity_breakdown: stats.severity_breakdown,
      status: 'pending',
      created_at: timestamp,
      // GSI for admin dashboard
      GSI1PK: 'PENDING_ADMIN_NOTIFICATIONS',
      GSI1SK: timestamp,
      // GSI2 for priority sorting
      GSI2PK: `PRIORITY#${stats.this_week_violations >= 10 ? 'critical' : 'high'}`,
      GSI2SK: timestamp,
    });

    logger.warn('🚨 ADMIN NOTIFIED: User exceeded violation threshold', {
      userId,
      weekKey,
      violationCount: stats.this_week_violations,
      notificationId,
    });

    // TODO: Send email/SNS to admin team
    // await this.sendAdminEmail(userId, stats);
  }

  /**
   * Auto-suspend user account
   */
  private static async autoSuspendUser(userId: string, stats: AbuseStats): Promise<void> {
    const timestamp = new Date().toISOString();
    const weekKey = this.getCurrentWeekKey();

    // Update user status
    await DynamoDBHelper.update(
      `USER#${userId}`,
      'PROFILE',
      'SET account_status = :status, suspended_at = :now, suspension_reason = :reason',
      {
        ':status': 'suspended',
        ':now': timestamp,
        ':reason': `Auto-suspended: ${stats.this_week_violations} violations in week ${weekKey}`,
      }
    );

    logger.error('🚫 AUTO-SUSPEND: User account suspended', {
      userId,
      weekKey,
      violationCount: stats.this_week_violations,
    });

    // Create suspension record
    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: `SUSPENSION#${timestamp}`,
      entity_type: 'account_suspension',
      user_id: userId,
      suspended_at: timestamp,
      suspension_type: 'auto',
      reason: `${stats.this_week_violations} violations in one week`,
      week_key: weekKey,
      violations: stats,
    });

    // Escalate to admin
    await this.escalateToAdmin(userId, stats, 'auto_suspension');
  }

  /**
   * Escalate critical case to admin
   */
  private static async escalateToAdmin(
    userId: string,
    stats: AbuseStats,
    escalationType: 'auto_suspension' | 'critical_violation'
  ): Promise<void> {
    const escalationId = uuidv4();
    const timestamp = new Date().toISOString();

    await DynamoDBHelper.put({
      PK: 'ADMIN_ESCALATIONS',
      SK: `${timestamp}#${escalationId}`,
      entity_type: 'admin_escalation',
      escalation_id: escalationId,
      escalation_type: escalationType,
      user_id: userId,
      stats: stats,
      created_at: timestamp,
      status: 'urgent',
      // GSI for admin dashboard - CRITICAL priority
      GSI1PK: 'URGENT_ESCALATIONS',
      GSI1SK: timestamp,
    });

    logger.error('🚨🚨🚨 CRITICAL ESCALATION TO ADMIN', {
      userId,
      escalationType,
      violationCount: stats.this_week_violations,
    });
  }

  /**
   * Get violations for current week (for admin dashboard)
   */
  static async getWeeklyViolations(weekKey?: string): Promise<any[]> {
    const targetWeek = weekKey || this.getCurrentWeekKey();

    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `VIOLATIONS#${targetWeek}`,
      },
      ScanIndexForward: false, // Most recent first
    });

    return result.Items || [];
  }

  /**
   * Get pending admin notifications
   */
  static async getPendingAdminNotifications(): Promise<AdminNotification[]> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'PENDING_ADMIN_NOTIFICATIONS',
      },
      ScanIndexForward: false,
      Limit: 50,
    });

    return result.Items as AdminNotification[] || [];
  }

  /**
   * Check if user is currently suspended
   */
  static async isUserSuspended(userId: string): Promise<boolean> {
    const profile = await DynamoDBHelper.get(`USER#${userId}`, 'PROFILE');
    return profile?.account_status === 'suspended';
  }

  /**
   * Get violation history for a user (for admin review)
   */
  static async getUserViolationHistory(userId: string, limit: number = 50): Promise<AbuseRecord[]> {
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'VIOLATION#',
      },
      Limit: limit,
      ScanIndexForward: false,
    });

    return result.Items as AbuseRecord[] || [];
  }

  /**
   * Weekly cleanup job (can be Lambda cron)
   * Note: Records auto-delete via TTL after 30 days
   * This is just for reporting/analytics
   */
  static async weeklyCleanupReport(): Promise<any> {
    const currentWeek = this.getCurrentWeekKey();
    const violations = await this.getWeeklyViolations(currentWeek);
    
    // Group by user
    const userViolations = violations.reduce((acc: any, v: any) => {
      if (!acc[v.user_id]) {
        acc[v.user_id] = [];
      }
      acc[v.user_id].push(v);
      return acc;
    }, {});

    const report = {
      week: currentWeek,
      total_violations: violations.length,
      unique_users: Object.keys(userViolations).length,
      severity_breakdown: {
        low: violations.filter((v: any) => v.severity === 'low').length,
        medium: violations.filter((v: any) => v.severity === 'medium').length,
        high: violations.filter((v: any) => v.severity === 'high').length,
        critical: violations.filter((v: any) => v.severity === 'critical').length,
      },
      users_suspended: violations.filter((v: any) => 
        userViolations[v.user_id]?.length >= this.AUTO_SUSPEND_THRESHOLD
      ).length,
    };

    logger.info('Weekly abuse report', report);
    return report;
  }
}
