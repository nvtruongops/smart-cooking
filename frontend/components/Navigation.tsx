/**
 * Main Navigation Component
 * Header navigation with links to all features including social features
 */

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import NotificationDropdown from './notifications/NotificationDropdown';

export default function Navigation() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = async () => {
        await signOut();
        router.push('/login');
    };

    const isActive = (path: string) => {
        return pathname === path;
    };

    const navLinkClass = (path: string) =>
        `px-3 py-2 rounded-md text-sm font-medium transition ${isActive(path)
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }`;

    if (!user) return null;

    return (
        <nav className="bg-white shadow-sm sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Logo and Main Nav */}
                    <div className="flex items-center space-x-8">
                        <Link href="/dashboard" className="flex items-center">
                            <span className="text-xl font-bold text-blue-600">Smart Cooking</span>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex space-x-1">
                            <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                                Dashboard
                            </Link>
                            <Link href="/feed" className={navLinkClass('/feed')}>
                                Feed
                            </Link>
                            <Link href="/friends" className={navLinkClass('/friends')}>
                                Friends
                            </Link>
                            <Link href="/ingredients" className={navLinkClass('/ingredients')}>
                                Ingredients
                            </Link>
                            <Link href="/history" className={navLinkClass('/history')}>
                                History
                            </Link>
                        </div>
                    </div>

                    {/* Right Side - Notifications and Profile */}
                    <div className="flex items-center space-x-4">
                        {/* Notifications */}
                        <NotificationDropdown />

                        {/* Profile Dropdown */}
                        <div className="relative group">
                            <button className="flex items-center space-x-2 text-gray-700 hover:text-gray-900">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                                    <span className="text-sm font-bold text-white">
                                        {(user.name || user.email).charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                                <div className="py-1">
                                    <Link
                                        href="/profile"
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        My Profile
                                    </Link>
                                    <Link
                                        href="/settings/privacy"
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        Privacy Settings
                                    </Link>
                                    <Link
                                        href="/notifications"
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 md:hidden"
                                    >
                                        Notifications
                                    </Link>
                                    <hr className="my-1" />
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Navigation */}
                <div className="md:hidden pb-3 space-y-1">
                    <Link
                        href="/dashboard"
                        className={`block ${navLinkClass('/dashboard')}`}
                    >
                        Dashboard
                    </Link>
                    <Link href="/feed" className={`block ${navLinkClass('/feed')}`}>
                        Feed
                    </Link>
                    <Link href="/friends" className={`block ${navLinkClass('/friends')}`}>
                        Friends
                    </Link>
                    <Link
                        href="/ingredients"
                        className={`block ${navLinkClass('/ingredients')}`}
                    >
                        Ingredients
                    </Link>
                    <Link href="/history" className={`block ${navLinkClass('/history')}`}>
                        History
                    </Link>
                </div>
            </div>
        </nav>
    );
}
