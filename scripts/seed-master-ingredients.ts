#!/usr/bin/env node
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'smart-cooking-data';

interface MasterIngredientData {
  name: string;
  category: string;
  aliases: string[];
}

// Vietnamese ingredients database with 500+ items
const VIETNAMESE_INGREDIENTS: MasterIngredientData[] = [
  // Meat & Poultry (Thịt)
  { name: 'Thịt bò', category: 'meat', aliases: ['bò', 'beef', 'thit bo'] },
  { name: 'Thịt heo', category: 'meat', aliases: ['heo', 'lợn', 'pork', 'thit heo', 'thit lon'] },
  { name: 'Thịt gà', category: 'meat', aliases: ['gà', 'chicken', 'thit ga'] },
  { name: 'Thịt vịt', category: 'meat', aliases: ['vịt', 'duck', 'thit vit'] },
  { name: 'Thịt dê', category: 'meat', aliases: ['dê', 'goat', 'thit de'] },
  { name: 'Thịt cừu', category: 'meat', aliases: ['cừu', 'lamb', 'thit cuu'] },
  { name: 'Thịt nai', category: 'meat', aliases: ['nai', 'venison', 'thit nai'] },
  { name: 'Thịt thỏ', category: 'meat', aliases: ['thỏ', 'rabbit', 'thit tho'] },
  { name: 'Xúc xích', category: 'meat', aliases: ['sausage', 'xuc xich'] },
  { name: 'Chả lụa', category: 'meat', aliases: ['cha lua', 'vietnamese ham'] },
  { name: 'Giò thủ', category: 'meat', aliases: ['gio thu', 'head cheese'] },
  { name: 'Chả cá', category: 'meat', aliases: ['cha ca', 'fish cake'] },
  { name: 'Nem nướng', category: 'meat', aliases: ['nem nuong', 'grilled pork patty'] },
  { name: 'Thịt ba chỉ', category: 'meat', aliases: ['ba chi', 'pork belly', 'thit ba chi'] },
  { name: 'Sườn heo', category: 'meat', aliases: ['suon heo', 'pork ribs', 'suon'] },
  { name: 'Sườn bò', category: 'meat', aliases: ['suon bo', 'beef ribs'] },
  { name: 'Thăn bò', category: 'meat', aliases: ['than bo', 'beef tenderloin'] },
  { name: 'Thăn heo', category: 'meat', aliases: ['than heo', 'pork tenderloin'] },
  { name: 'Nạm bò', category: 'meat', aliases: ['nam bo', 'beef brisket'] },
  { name: 'Gân bò', category: 'meat', aliases: ['gan bo', 'beef tendon'] },

  // Seafood (Hải sản)
  { name: 'Cá', category: 'seafood', aliases: ['fish', 'ca'] },
  { name: 'Tôm', category: 'seafood', aliases: ['shrimp', 'tom'] },
  { name: 'Cua', category: 'seafood', aliases: ['crab'] },
  { name: 'Ghẹ', category: 'seafood', aliases: ['mud crab', 'ghe'] },
  { name: 'Mực', category: 'seafood', aliases: ['squid', 'muc'] },
  { name: 'Bạch tuộc', category: 'seafood', aliases: ['octopus', 'bach tuoc'] },
  { name: 'Cá hồi', category: 'seafood', aliases: ['salmon', 'ca hoi'] },
  { name: 'Cá thu', category: 'seafood', aliases: ['mackerel', 'ca thu'] },
  { name: 'Cá ngừ', category: 'seafood', aliases: ['tuna', 'ca ngu'] },
  { name: 'Cá rô phi', category: 'seafood', aliases: ['tilapia', 'ca ro phi'] },
  { name: 'Cá chép', category: 'seafood', aliases: ['carp', 'ca chep'] },
  { name: 'Cá trắm', category: 'seafood', aliases: ['grass carp', 'ca tram'] },
  { name: 'Cá lóc', category: 'seafood', aliases: ['snakehead fish', 'ca loc'] },
  { name: 'Cá basa', category: 'seafood', aliases: ['basa fish', 'ca basa'] },
  { name: 'Cá tra', category: 'seafood', aliases: ['tra fish', 'ca tra'] },
  { name: 'Tôm sú', category: 'seafood', aliases: ['black tiger shrimp', 'tom su'] },
  { name: 'Tôm thẻ', category: 'seafood', aliases: ['white shrimp', 'tom the'] },
  { name: 'Nghêu', category: 'seafood', aliases: ['clam', 'ngheu'] },
  { name: 'Sò', category: 'seafood', aliases: ['oyster', 'so'] },
  { name: 'Ốc', category: 'seafood', aliases: ['snail', 'oc'] },

  // Vegetables (Rau củ)
  { name: 'Cà chua', category: 'vegetable', aliases: ['tomato', 'ca chua'] },
  { name: 'Hành tây', category: 'vegetable', aliases: ['onion', 'hanh tay'] },
  { name: 'Hành lá', category: 'vegetable', aliases: ['green onion', 'scallion', 'hanh la'] },
  { name: 'Tỏi', category: 'vegetable', aliases: ['garlic', 'toi'] },
  { name: 'Gừng', category: 'vegetable', aliases: ['ginger', 'gung'] },
  { name: 'Ớt', category: 'vegetable', aliases: ['chili', 'pepper', 'ot'] },
  { name: 'Cà rót', category: 'vegetable', aliases: ['carrot', 'ca rot'] },
  { name: 'Khoai tây', category: 'vegetable', aliases: ['potato', 'khoai tay'] },
  { name: 'Khoai lang', category: 'vegetable', aliases: ['sweet potato', 'khoai lang'] },
  { name: 'Củ cải trắng', category: 'vegetable', aliases: ['daikon radish', 'cu cai trang'] },
  { name: 'Củ cải đỏ', category: 'vegetable', aliases: ['red radish', 'cu cai do'] },
  { name: 'Bắp cải', category: 'vegetable', aliases: ['cabbage', 'bap cai'] },
  { name: 'Cải thảo', category: 'vegetable', aliases: ['napa cabbage', 'cai thao'] },
  { name: 'Cải bó xôi', category: 'vegetable', aliases: ['spinach', 'cai bo xoi'] },
  { name: 'Rau muống', category: 'vegetable', aliases: ['water spinach', 'rau muong'] },
  { name: 'Rau cần', category: 'vegetable', aliases: ['celery', 'rau can'] },
  { name: 'Rau mùi', category: 'vegetable', aliases: ['cilantro', 'coriander', 'rau mui'] },
  { name: 'Húng quế', category: 'vegetable', aliases: ['basil', 'hung que'] },
  { name: 'Lá chanh', category: 'vegetable', aliases: ['lime leaves', 'la chanh'] },
  { name: 'Lá cà ri', category: 'vegetable', aliases: ['curry leaves', 'la ca ri'] },
  { name: 'Ngò gai', category: 'vegetable', aliases: ['sawtooth coriander', 'ngo gai'] },
  // More vegetables
  { name: 'Rau thơm', category: 'vegetable', aliases: ['herbs', 'rau thom'] },
  { name: 'Bầu', category: 'vegetable', aliases: ['bottle gourd', 'bau'] },
  { name: 'Bí đao', category: 'vegetable', aliases: ['winter melon', 'bi dao'] },
  { name: 'Bí đỏ', category: 'vegetable', aliases: ['pumpkin', 'bi do'] },
  { name: 'Mướp', category: 'vegetable', aliases: ['luffa', 'muop'] },
  { name: 'Khổ qua', category: 'vegetable', aliases: ['bitter melon', 'kho qua'] },
  { name: 'Dưa chuột', category: 'vegetable', aliases: ['cucumber', 'dua chuot'] },
  { name: 'Cà tím', category: 'vegetable', aliases: ['eggplant', 'ca tim'] },
  { name: 'Đậu cove', category: 'vegetable', aliases: ['okra', 'dau cove'] },
  { name: 'Đậu que', category: 'vegetable', aliases: ['green beans', 'dau que'] },
  { name: 'Đậu bắp', category: 'vegetable', aliases: ['snap peas', 'dau bap'] },
  { name: 'Đậu Hà Lan', category: 'vegetable', aliases: ['peas', 'dau ha lan'] },
  { name: 'Bắp', category: 'vegetable', aliases: ['corn', 'bap'] },
  { name: 'Nấm', category: 'vegetable', aliases: ['mushroom', 'nam'] },
  { name: 'Nấm hương', category: 'vegetable', aliases: ['shiitake mushroom', 'nam huong'] },
  { name: 'Nấm rơm', category: 'vegetable', aliases: ['straw mushroom', 'nam rom'] },
  { name: 'Nấm kim châm', category: 'vegetable', aliases: ['enoki mushroom', 'nam kim cham'] },
  { name: 'Măng', category: 'vegetable', aliases: ['bamboo shoots', 'mang'] },
  { name: 'Măng tây', category: 'vegetable', aliases: ['asparagus', 'mang tay'] },
  { name: 'Su hào', category: 'vegetable', aliases: ['kohlrabi', 'su hao'] },
  { name: 'Cần tây', category: 'vegetable', aliases: ['celery', 'can tay'] },
  { name: 'Đu đủ xanh', category: 'vegetable', aliases: ['green papaya', 'du du xanh'] },
  { name: 'Chuối xanh', category: 'vegetable', aliases: ['green banana', 'chuoi xanh'] },
  { name: 'Bông cải xanh', category: 'vegetable', aliases: ['broccoli', 'bong cai xanh'] },
  { name: 'Bông cải trắng', category: 'vegetable', aliases: ['cauliflower', 'bong cai trang'] },

  // Fruits (Trái cây)
  { name: 'Chuối', category: 'fruit', aliases: ['banana', 'chuoi'] },
  { name: 'Táo', category: 'fruit', aliases: ['apple', 'tao'] },
  { name: 'Cam', category: 'fruit', aliases: ['orange', 'cam'] },
  { name: 'Chanh', category: 'fruit', aliases: ['lime', 'lemon', 'chanh'] },
  { name: 'Bưởi', category: 'fruit', aliases: ['pomelo', 'buoi'] },
  { name: 'Xoài', category: 'fruit', aliases: ['mango', 'xoai'] },
  { name: 'Đu đủ', category: 'fruit', aliases: ['papaya', 'du du'] },
  { name: 'Dứa', category: 'fruit', aliases: ['pineapple', 'dua', 'khom'] },
  { name: 'Dưa hấu', category: 'fruit', aliases: ['watermelon', 'dua hau'] },
  { name: 'Dưa lưới', category: 'fruit', aliases: ['cantaloupe', 'dua luoi'] },
  { name: 'Nho', category: 'fruit', aliases: ['grape', 'nho'] },
  { name: 'Lê', category: 'fruit', aliases: ['pear', 'le'] },
  { name: 'Đào', category: 'fruit', aliases: ['peach', 'dao'] },
  { name: 'Mận', category: 'fruit', aliases: ['plum', 'man'] },
  { name: 'Vải', category: 'fruit', aliases: ['lychee', 'vai'] },
  { name: 'Nhãn', category: 'fruit', aliases: ['longan', 'nhan'] },
  { name: 'Chôm chôm', category: 'fruit', aliases: ['rambutan', 'chom chom'] },
  { name: 'Măng cụt', category: 'fruit', aliases: ['mangosteen', 'mang cut'] },
  { name: 'Sầu riêng', category: 'fruit', aliases: ['durian', 'sau rieng'] },
  { name: 'Mít', category: 'fruit', aliases: ['jackfruit', 'mit'] },
  { name: 'Na', category: 'fruit', aliases: ['custard apple', 'na'] },
  { name: 'Mãng cầu', category: 'fruit', aliases: ['soursop', 'mang cau'] },
  { name: 'Ổi', category: 'fruit', aliases: ['guava', 'oi'] },
  { name: 'Dâu tây', category: 'fruit', aliases: ['strawberry', 'dau tay'] },
  { name: 'Việt quất', category: 'fruit', aliases: ['blueberry', 'viet quat'] },
  { name: 'Dâu đen', category: 'fruit', aliases: ['blackberry', 'dau den'] },
  { name: 'Dâu tằm', category: 'fruit', aliases: ['mulberry', 'dau tam'] },
  { name: 'Kiwi', category: 'fruit', aliases: ['kiwi fruit'] },
  { name: 'Thanh long', category: 'fruit', aliases: ['dragon fruit', 'thanh long'] },
  { name: 'Chà là', category: 'fruit', aliases: ['persimmon', 'cha la'] },

  // Grains & Starches (Ngũ cốc)
  { name: 'Gạo', category: 'grain', aliases: ['rice', 'gao'] },
  { name: 'Gạo tẻ', category: 'grain', aliases: ['jasmine rice', 'gao te'] },
  { name: 'Gạo nàng hương', category: 'grain', aliases: ['fragrant rice', 'gao nang huong'] },
  { name: 'Gạo nếp', category: 'grain', aliases: ['glutinous rice', 'sticky rice', 'gao nep'] },
  { name: 'Bột mì', category: 'grain', aliases: ['wheat flour', 'bot mi'] },
  { name: 'Bột gạo', category: 'grain', aliases: ['rice flour', 'bot gao'] },
  { name: 'Bột năng', category: 'grain', aliases: ['tapioca starch', 'bot nang'] },
  { name: 'Bột ngô', category: 'grain', aliases: ['corn starch', 'bot ngo'] },
  { name: 'Yến mạch', category: 'grain', aliases: ['oats', 'yen mach'] },
  { name: 'Lúa mạch', category: 'grain', aliases: ['barley', 'lua mach'] },
  { name: 'Quinoa', category: 'grain', aliases: ['quinoa'] },
  { name: 'Bánh mì', category: 'grain', aliases: ['bread', 'banh mi'] },
  { name: 'Bánh phở', category: 'grain', aliases: ['pho noodles', 'banh pho'] },
  { name: 'Bún', category: 'grain', aliases: ['vermicelli', 'bun'] },
  { name: 'Miến', category: 'grain', aliases: ['glass noodles', 'mien'] },
  { name: 'Mì', category: 'grain', aliases: ['noodles', 'mi'] },
  { name: 'Mì ý', category: 'grain', aliases: ['pasta', 'mi y'] },

  // Legumes (Đậu)
  { name: 'Đậu phộng', category: 'legume', aliases: ['peanut', 'dau phong'] },
  { name: 'Đậu xanh', category: 'legume', aliases: ['mung bean', 'dau xanh'] },
  { name: 'Đậu đỏ', category: 'legume', aliases: ['red bean', 'dau do'] },
  { name: 'Đậu đen', category: 'legume', aliases: ['black bean', 'dau den'] },
  { name: 'Đậu nành', category: 'legume', aliases: ['soybean', 'dau nanh'] },
  { name: 'Đậu hũ', category: 'legume', aliases: ['tofu', 'dau hu'] },
  { name: 'Tàu hũ ky', category: 'legume', aliases: ['fried tofu skin', 'tau hu ky'] },
  { name: 'Chả cá thực vật', category: 'legume', aliases: ['fish tofu', 'cha ca thuc vat'] },
  { name: 'Đậu phụ', category: 'legume', aliases: ['bean curd', 'dau phu'] },

  // Dairy & Eggs (Sữa & Trứng)
  { name: 'Trứng gà', category: 'dairy', aliases: ['chicken egg', 'trung ga'] },
  { name: 'Trứng vịt', category: 'dairy', aliases: ['duck egg', 'trung vit'] },
  { name: 'Trứng cút', category: 'dairy', aliases: ['quail egg', 'trung cut'] },
  { name: 'Sữa tươi', category: 'dairy', aliases: ['fresh milk', 'sua tuoi'] },
  { name: 'Sữa đặc', category: 'dairy', aliases: ['condensed milk', 'sua dac'] },
  { name: 'Sữa chua', category: 'dairy', aliases: ['yogurt', 'sua chua'] },
  { name: 'Phô mai', category: 'dairy', aliases: ['cheese', 'pho mai'] },
  { name: 'Bơ', category: 'dairy', aliases: ['butter', 'bo'] },
  { name: 'Kem', category: 'dairy', aliases: ['cream', 'kem'] },

  // Spices & Seasonings (Gia vị)
  { name: 'Muối', category: 'spice', aliases: ['salt', 'muoi'] },
  { name: 'Đường', category: 'spice', aliases: ['sugar', 'duong'] },
  { name: 'Tiêu', category: 'spice', aliases: ['pepper', 'tieu'] },
  { name: 'Nước mắm', category: 'spice', aliases: ['fish sauce', 'nuoc mam'] },
  { name: 'Tương ớt', category: 'spice', aliases: ['chili sauce', 'tuong ot'] },
  { name: 'Tương đen', category: 'spice', aliases: ['dark soy sauce', 'tuong den'] },
  { name: 'Dầu hào', category: 'spice', aliases: ['oyster sauce', 'dau hao'] },
  { name: 'Giấm', category: 'spice', aliases: ['vinegar', 'giam'] },
  { name: 'Dầu ăn', category: 'spice', aliases: ['cooking oil', 'dau an'] },
  { name: 'Dầu mè', category: 'spice', aliases: ['sesame oil', 'dau me'] },
  { name: 'Mè', category: 'spice', aliases: ['sesame', 'me'] },
  { name: 'Vừng', category: 'spice', aliases: ['sesame seeds', 'vung'] },
  { name: 'Hạt điều', category: 'spice', aliases: ['cashew', 'hat dieu'] },
  { name: 'Hạt dẻ', category: 'spice', aliases: ['chestnut', 'hat de'] },
  { name: 'Quế', category: 'spice', aliases: ['cinnamon', 'que'] },
  { name: 'Hồi', category: 'spice', aliases: ['star anise', 'hoi'] },
  { name: 'Thảo quả', category: 'spice', aliases: ['black cardamom', 'thao qua'] },
  { name: 'Đinh hương', category: 'spice', aliases: ['clove', 'dinh huong'] },
  { name: 'Hạt tiêu', category: 'spice', aliases: ['peppercorn', 'hat tieu'] },
  { name: 'Nghệ', category: 'spice', aliases: ['turmeric', 'nghe'] },
  { name: 'Riềng', category: 'spice', aliases: ['galangal', 'rieng'] },
  { name: 'Sả', category: 'spice', aliases: ['lemongrass', 'sa'] },
  { name: 'Lá chanh khô', category: 'spice', aliases: ['dried kaffir lime leaves', 'la chanh kho'] },
  { name: 'Mắm tôm', category: 'spice', aliases: ['shrimp paste', 'mam tom'] },
  { name: 'Mắm ruốc', category: 'spice', aliases: ['fermented shrimp sauce', 'mam ruoc'] },
  { name: 'Tương bần', category: 'spice', aliases: ['fermented soybean paste', 'tuong ban'] },
  { name: 'Mật ong', category: 'spice', aliases: ['honey', 'mat ong'] },
  { name: 'Đường phèn', category: 'spice', aliases: ['rock sugar', 'duong phen'] },
  { name: 'Bột ngọt', category: 'spice', aliases: ['msg', 'bot ngot'] },
  { name: 'Bột canh', category: 'spice', aliases: ['soup powder', 'bot canh'] },

  // Beverages (Đồ uống)
  { name: 'Nước', category: 'beverage', aliases: ['water', 'nuoc'] },
  { name: 'Trà', category: 'beverage', aliases: ['tea', 'tra'] },
  { name: 'Cà phê', category: 'beverage', aliases: ['coffee', 'ca phe'] },
  { name: 'Bia', category: 'beverage', aliases: ['beer', 'bia'] },
  { name: 'Rượu', category: 'beverage', aliases: ['wine', 'alcohol', 'ruou'] },
  { name: 'Nước dừa', category: 'beverage', aliases: ['coconut water', 'nuoc dua'] },
  { name: 'Nước mía', category: 'beverage', aliases: ['sugarcane juice', 'nuoc mia'] },
  { name: 'Sinh tố', category: 'beverage', aliases: ['smoothie', 'sinh to'] },
  { name: 'Nước ngọt', category: 'beverage', aliases: ['soft drink', 'nuoc ngot'] },

  // Nuts & Seeds (Hạt)
  { name: 'Hạt sen', category: 'nut', aliases: ['lotus seeds', 'hat sen'] },
  { name: 'Hạt dưa', category: 'nut', aliases: ['watermelon seeds', 'hat dua'] },
  { name: 'Hạt hướng dương', category: 'nut', aliases: ['sunflower seeds', 'hat huong duong'] },
  { name: 'Hạt bí', category: 'nut', aliases: ['pumpkin seeds', 'hat bi'] },
  { name: 'Óc chó', category: 'nut', aliases: ['walnut', 'oc cho'] },
  { name: 'Hạnh nhân', category: 'nut', aliases: ['almond', 'hanh nhan'] },
  { name: 'Hạt macca', category: 'nut', aliases: ['macadamia', 'hat macca'] },
  { name: 'Hạt phỉ', category: 'nut', aliases: ['hazelnut', 'hat phi'] },

  // Processed Foods (Thực phẩm chế biến)
  { name: 'Bánh tráng', category: 'processed', aliases: ['rice paper', 'banh trang'] },
  { name: 'Bánh đa', category: 'processed', aliases: ['rice crackers', 'banh da'] },
  { name: 'Bánh tôm', category: 'processed', aliases: ['shrimp crackers', 'banh tom'] },
  { name: 'Chả ram', category: 'processed', aliases: ['fried fish cake', 'cha ram'] },
  { name: 'Nem chua', category: 'processed', aliases: ['fermented pork', 'nem chua'] },
  { name: 'Mắm cá', category: 'processed', aliases: ['fermented fish', 'mam ca'] },
  { name: 'Dưa chua', category: 'processed', aliases: ['pickled vegetables', 'dua chua'] },
  { name: 'Củ kiệu', category: 'processed', aliases: ['pickled scallions', 'cu kieu'] },
  { name: 'Hành muối', category: 'processed', aliases: ['pickled onions', 'hanh muoi'] },
  { name: 'Bánh cuốn', category: 'processed', aliases: ['steamed rice rolls', 'banh cuon'] },
  { name: 'Bánh chưng', category: 'processed', aliases: ['sticky rice cake', 'banh chung'] },
  { name: 'Bánh tét', category: 'processed', aliases: ['cylindrical sticky rice cake', 'banh tet'] },
  { name: 'Bánh ít', category: 'processed', aliases: ['small dumpling', 'banh it'] },
  { name: 'Bánh bèo', category: 'processed', aliases: ['water fern cake', 'banh beo'] },
  { name: 'Bánh nậm', category: 'processed', aliases: ['flat rice dumpling', 'banh nam'] },
  { name: 'Bánh lọc', category: 'processed', aliases: ['clear shrimp dumpling', 'banh loc'] },
  { name: 'Bánh căn', category: 'processed', aliases: ['mini pancakes', 'banh can'] },
  { name: 'Bánh xèo', category: 'processed', aliases: ['sizzling pancake', 'banh xeo'] },
  { name: 'Bánh khọt', category: 'processed', aliases: ['mini pancakes', 'banh khot'] },
  { name: 'Bánh mì que', category: 'processed', aliases: ['baguette stick', 'banh mi que'] },

  // Additional Meat & Poultry
  { name: 'Thịt chuột', category: 'meat', aliases: ['rat meat', 'thit chuot'] },
  { name: 'Thịt chó', category: 'meat', aliases: ['dog meat', 'thit cho'] },
  { name: 'Thịt mèo', category: 'meat', aliases: ['cat meat', 'thit meo'] },
  { name: 'Thịt rắn', category: 'meat', aliases: ['snake meat', 'thit ran'] },
  { name: 'Thịt ếch', category: 'meat', aliases: ['frog meat', 'thit ech'] },
  { name: 'Thịt cua đồng', category: 'meat', aliases: ['field crab meat', 'thit cua dong'] },
  { name: 'Thịt ốc', category: 'meat', aliases: ['snail meat', 'thit oc'] },
  { name: 'Thịt sò', category: 'meat', aliases: ['oyster meat', 'thit so'] },
  { name: 'Thịt trai', category: 'meat', aliases: ['mussel meat', 'thit trai'] },
  { name: 'Gan bò', category: 'meat', aliases: ['beef liver', 'gan bo'] },
  { name: 'Gan heo', category: 'meat', aliases: ['pork liver', 'gan heo'] },
  { name: 'Gan gà', category: 'meat', aliases: ['chicken liver', 'gan ga'] },
  { name: 'Tim bò', category: 'meat', aliases: ['beef heart', 'tim bo'] },
  { name: 'Tim heo', category: 'meat', aliases: ['pork heart', 'tim heo'] },
  { name: 'Lưỡi bò', category: 'meat', aliases: ['beef tongue', 'luoi bo'] },
  { name: 'Lưỡi heo', category: 'meat', aliases: ['pork tongue', 'luoi heo'] },
  { name: 'Óc heo', category: 'meat', aliases: ['pork brain', 'oc heo'] },
  { name: 'Thận heo', category: 'meat', aliases: ['pork kidney', 'than heo'] },
  { name: 'Dạ dày heo', category: 'meat', aliases: ['pork stomach', 'da day heo'] },
  { name: 'Ruột heo', category: 'meat', aliases: ['pork intestine', 'ruot heo'] },
  { name: 'Tai heo', category: 'meat', aliases: ['pork ear', 'tai heo'] },
  { name: 'Chân heo', category: 'meat', aliases: ['pork trotters', 'chan heo'] },
  { name: 'Móng heo', category: 'meat', aliases: ['pork hoof', 'mong heo'] },

  // Additional Seafood
  { name: 'Cá heo', category: 'seafood', aliases: ['dolphin fish', 'ca heo'] },
  { name: 'Cá mập', category: 'seafood', aliases: ['shark', 'ca map'] },
  { name: 'Cá voi', category: 'seafood', aliases: ['whale', 'ca voi'] },
  { name: 'Cá sấu', category: 'seafood', aliases: ['crocodile', 'ca sau'] },
  { name: 'Cá rùa', category: 'seafood', aliases: ['turtle', 'ca rua'] },
  { name: 'Cá đuối', category: 'seafood', aliases: ['stingray', 'ca duoi'] },
  { name: 'Cá mú', category: 'seafood', aliases: ['grouper', 'ca mu'] },
  { name: 'Cá hồng', category: 'seafood', aliases: ['red snapper', 'ca hong'] },
  { name: 'Cá diêu hồng', category: 'seafood', aliases: ['red tilapia', 'ca dieu hong'] },
  { name: 'Cá kho', category: 'seafood', aliases: ['dried fish', 'ca kho'] },
  { name: 'Cá mắm', category: 'seafood', aliases: ['fermented fish', 'ca mam'] },
  { name: 'Tôm khô', category: 'seafood', aliases: ['dried shrimp', 'tom kho'] },
  { name: 'Mực khô', category: 'seafood', aliases: ['dried squid', 'muc kho'] },
  { name: 'Cua biển', category: 'seafood', aliases: ['sea crab', 'cua bien'] },
  { name: 'Cua đồng', category: 'seafood', aliases: ['field crab', 'cua dong'] },
  { name: 'Tôm càng', category: 'seafood', aliases: ['freshwater prawn', 'tom cang'] },
  { name: 'Tôm hùm', category: 'seafood', aliases: ['lobster', 'tom hum'] },
  { name: 'Sò điệp', category: 'seafood', aliases: ['scallop', 'so diep'] },
  { name: 'Sò huyết', category: 'seafood', aliases: ['blood cockle', 'so huyet'] },
  { name: 'Ốc hương', category: 'seafood', aliases: ['babylon snail', 'oc huong'] },
  { name: 'Ốc bươu', category: 'seafood', aliases: ['apple snail', 'oc buou'] },
  { name: 'Ốc len', category: 'seafood', aliases: ['mud snail', 'oc len'] },
  { name: 'Ốc mỡ', category: 'seafood', aliases: ['fat snail', 'oc mo'] },

  // Additional Vegetables
  { name: 'Rau dền', category: 'vegetable', aliases: ['amaranth', 'rau den'] },
  { name: 'Rau ngót', category: 'vegetable', aliases: ['sauropus', 'rau ngot'] },
  { name: 'Rau má', category: 'vegetable', aliases: ['pennywort', 'rau ma'] },
  { name: 'Rau răm', category: 'vegetable', aliases: ['vietnamese coriander', 'rau ram'] },
  { name: 'Kinh giới', category: 'vegetable', aliases: ['vietnamese balm', 'kinh gioi'] },
  { name: 'Tía tô', category: 'vegetable', aliases: ['perilla', 'tia to'] },
  { name: 'Lá lốt', category: 'vegetable', aliases: ['wild betel leaf', 'la lot'] },
  { name: 'Lá chuối', category: 'vegetable', aliases: ['banana leaf', 'la chuoi'] },
  { name: 'Lá dong', category: 'vegetable', aliases: ['dong leaf', 'la dong'] },
  { name: 'Lá sen', category: 'vegetable', aliases: ['lotus leaf', 'la sen'] },
  { name: 'Ngò sen', category: 'vegetable', aliases: ['lotus stem', 'ngo sen'] },
  { name: 'Bông so đũa', category: 'vegetable', aliases: ['sesbania flower', 'bong so dua'] },
  { name: 'Bông điên điển', category: 'vegetable', aliases: ['sesbania flower', 'bong dien dien'] },
  { name: 'Bông bí', category: 'vegetable', aliases: ['pumpkin flower', 'bong bi'] },
  { name: 'Bông chuối', category: 'vegetable', aliases: ['banana flower', 'bong chuoi'] },
  { name: 'Măng tre', category: 'vegetable', aliases: ['bamboo shoots', 'mang tre'] },
  { name: 'Măng tươi', category: 'vegetable', aliases: ['fresh bamboo shoots', 'mang tuoi'] },
  { name: 'Măng khô', category: 'vegetable', aliases: ['dried bamboo shoots', 'mang kho'] },
  { name: 'Rau muống nước', category: 'vegetable', aliases: ['water spinach', 'rau muong nuoc'] },
  { name: 'Rau muống cạn', category: 'vegetable', aliases: ['land spinach', 'rau muong can'] },
  { name: 'Cải xanh', category: 'vegetable', aliases: ['bok choy', 'cai xanh'] },
  { name: 'Cải ngọt', category: 'vegetable', aliases: ['sweet cabbage', 'cai ngot'] },
  { name: 'Cải cúc', category: 'vegetable', aliases: ['chrysanthemum greens', 'cai cuc'] },
  { name: 'Cải soong', category: 'vegetable', aliases: ['choy sum', 'cai soong'] },
  { name: 'Cải be trắng', category: 'vegetable', aliases: ['white cabbage', 'cai be trang'] },
  { name: 'Su su', category: 'vegetable', aliases: ['chayote', 'su su'] },
  { name: 'Bầu bí', category: 'vegetable', aliases: ['bottle gourd', 'bau bi'] },
  { name: 'Mướp hương', category: 'vegetable', aliases: ['angled luffa', 'muop huong'] },
  { name: 'Mướp đắng', category: 'vegetable', aliases: ['bitter gourd', 'muop dang'] },
  { name: 'Dưa gang', category: 'vegetable', aliases: ['wax gourd', 'dua gang'] },
  { name: 'Dưa leo', category: 'vegetable', aliases: ['cucumber', 'dua leo'] },

  // Additional Fruits
  { name: 'Roi', category: 'fruit', aliases: ['custard apple', 'roi'] },
  { name: 'Bòn bon', category: 'fruit', aliases: ['carambola', 'bon bon'] },
  { name: 'Khế', category: 'fruit', aliases: ['star fruit', 'khe'] },
  { name: 'Me', category: 'fruit', aliases: ['tamarind', 'me'] },
  { name: 'Cóc', category: 'fruit', aliases: ['hog plum', 'coc'] },
  { name: 'Táo tàu', category: 'fruit', aliases: ['jujube', 'tao tau'] },
  { name: 'Hồng xiêm', category: 'fruit', aliases: ['persimmon', 'hong xiem'] },
  { name: 'Sung', category: 'fruit', aliases: ['fig', 'sung'] },
  { name: 'Mận hậu', category: 'fruit', aliases: ['plum', 'man hau'] },
  { name: 'Roi thái', category: 'fruit', aliases: ['thai custard apple', 'roi thai'] },
  { name: 'Bưởi da xanh', category: 'fruit', aliases: ['green skin pomelo', 'buoi da xanh'] },
  { name: 'Bưởi năm roi', category: 'fruit', aliases: ['nam roi pomelo', 'buoi nam roi'] },
  { name: 'Cam sành', category: 'fruit', aliases: ['sanh orange', 'cam sanh'] },
  { name: 'Cam Vinh', category: 'fruit', aliases: ['vinh orange', 'cam vinh'] },
  { name: 'Quýt', category: 'fruit', aliases: ['mandarin', 'quyt'] },
  { name: 'Chanh leo', category: 'fruit', aliases: ['passion fruit', 'chanh leo'] },
  { name: 'Chanh dây', category: 'fruit', aliases: ['passion fruit', 'chanh day'] },
  { name: 'Dâu da đất', category: 'fruit', aliases: ['strawberry', 'dau da dat'] },
  { name: 'Cherry', category: 'fruit', aliases: ['cherry'] },
  { name: 'Lựu', category: 'fruit', aliases: ['pomegranate', 'luu'] },
  { name: 'Dừa', category: 'fruit', aliases: ['coconut', 'dua'] },
  { name: 'Dừa xiêm', category: 'fruit', aliases: ['thai coconut', 'dua xiem'] },
  { name: 'Cau', category: 'fruit', aliases: ['areca nut', 'cau'] },
  { name: 'Trầu', category: 'fruit', aliases: ['betel leaf', 'trau'] },

  // Additional Grains & Starches
  { name: 'Cơm tấm', category: 'grain', aliases: ['broken rice', 'com tam'] },
  { name: 'Cơm dẻo', category: 'grain', aliases: ['sticky rice', 'com deo'] },
  { name: 'Bánh tráng nướng', category: 'grain', aliases: ['grilled rice paper', 'banh trang nuong'] },
  { name: 'Bánh hỏi', category: 'grain', aliases: ['vermicelli sheets', 'banh hoi'] },
  { name: 'Bánh canh', category: 'grain', aliases: ['thick noodles', 'banh canh'] },
  { name: 'Bánh đa cua', category: 'grain', aliases: ['crab noodle soup', 'banh da cua'] },
  { name: 'Bún bò', category: 'grain', aliases: ['beef noodle soup', 'bun bo'] },
  { name: 'Bún riêu', category: 'grain', aliases: ['crab noodle soup', 'bun rieu'] },
  { name: 'Bún chả', category: 'grain', aliases: ['grilled pork noodles', 'bun cha'] },
  { name: 'Phở bò', category: 'grain', aliases: ['beef pho', 'pho bo'] },
  { name: 'Phở gà', category: 'grain', aliases: ['chicken pho', 'pho ga'] },
  { name: 'Hủ tiếu', category: 'grain', aliases: ['hu tieu noodles', 'hu tieu'] },
  { name: 'Mì quảng', category: 'grain', aliases: ['quang noodles', 'mi quang'] },
  { name: 'Cao lầu', category: 'grain', aliases: ['cao lau noodles', 'cao lau'] },

  // Additional Legumes
  { name: 'Đậu tương', category: 'legume', aliases: ['soybean', 'dau tuong'] },
  { name: 'Đậu ve', category: 'legume', aliases: ['black-eyed pea', 'dau ve'] },
  { name: 'Đậu cô ve', category: 'legume', aliases: ['cowpea', 'dau co ve'] },
  { name: 'Đậu trắng', category: 'legume', aliases: ['white bean', 'dau trang'] },
  { name: 'Đậu lima', category: 'legume', aliases: ['lima bean', 'dau lima'] },
  { name: 'Đậu kidney', category: 'legume', aliases: ['kidney bean', 'dau kidney'] },
  { name: 'Đậu garbanzo', category: 'legume', aliases: ['chickpea', 'dau garbanzo'] },
  { name: 'Đậu lăng', category: 'legume', aliases: ['lentil', 'dau lang'] },
  { name: 'Chè đậu xanh', category: 'legume', aliases: ['mung bean dessert', 'che dau xanh'] },
  { name: 'Chè đậu đỏ', category: 'legume', aliases: ['red bean dessert', 'che dau do'] },
  { name: 'Sữa đậu nành', category: 'legume', aliases: ['soy milk', 'sua dau nanh'] },
  { name: 'Tương đậu nành', category: 'legume', aliases: ['soy sauce', 'tuong dau nanh'] },

  // Additional Spices & Seasonings
  { name: 'Hạt nêm', category: 'spice', aliases: ['seasoning powder', 'hat nem'] },
  { name: 'Bột nêm', category: 'spice', aliases: ['seasoning powder', 'bot nem'] },
  { name: 'Mắm nêm', category: 'spice', aliases: ['fermented anchovy paste', 'mam nem'] },
  { name: 'Mắm cá linh', category: 'spice', aliases: ['fermented fish sauce', 'mam ca linh'] },
  { name: 'Tương ớt Sriracha', category: 'spice', aliases: ['sriracha sauce', 'tuong ot sriracha'] },
  { name: 'Tương cà', category: 'spice', aliases: ['tomato sauce', 'tuong ca'] },
  { name: 'Mayonnaise', category: 'spice', aliases: ['mayo'] },
  { name: 'Tương mayonnaise', category: 'spice', aliases: ['mayo sauce', 'tuong mayonnaise'] },
  { name: 'Dầu điều', category: 'spice', aliases: ['cashew oil', 'dau dieu'] },
  { name: 'Dầu dừa', category: 'spice', aliases: ['coconut oil', 'dau dua'] },
  { name: 'Dầu cọ', category: 'spice', aliases: ['palm oil', 'dau co'] },
  { name: 'Dầu oliu', category: 'spice', aliases: ['olive oil', 'dau oliu'] },
  { name: 'Giấm táo', category: 'spice', aliases: ['apple vinegar', 'giam tao'] },
  { name: 'Giấm gạo', category: 'spice', aliases: ['rice vinegar', 'giam gao'] },
  { name: 'Giấm balsamic', category: 'spice', aliases: ['balsamic vinegar', 'giam balsamic'] },
  { name: 'Đường cát', category: 'spice', aliases: ['granulated sugar', 'duong cat'] },
  { name: 'Đường thốt nốt', category: 'spice', aliases: ['palm sugar', 'duong thot not'] },
  { name: 'Đường mía', category: 'spice', aliases: ['cane sugar', 'duong mia'] },
  { name: 'Đường nâu', category: 'spice', aliases: ['brown sugar', 'duong nau'] },
  { name: 'Muối biển', category: 'spice', aliases: ['sea salt', 'muoi bien'] },
  { name: 'Muối hạt', category: 'spice', aliases: ['rock salt', 'muoi hat'] },
  { name: 'Muối tiêu', category: 'spice', aliases: ['salt and pepper', 'muoi tieu'] },
  { name: 'Bột cà ri', category: 'spice', aliases: ['curry powder', 'bot ca ri'] },
  { name: 'Bột ớt', category: 'spice', aliases: ['chili powder', 'bot ot'] },
  { name: 'Bột tỏi', category: 'spice', aliases: ['garlic powder', 'bot toi'] },
  { name: 'Bột hành', category: 'spice', aliases: ['onion powder', 'bot hanh'] },
  { name: 'Bột gừng', category: 'spice', aliases: ['ginger powder', 'bot gung'] },
  { name: 'Bột nghệ', category: 'spice', aliases: ['turmeric powder', 'bot nghe'] },
  { name: 'Bột quế', category: 'spice', aliases: ['cinnamon powder', 'bot que'] },
  { name: 'Bột hồi', category: 'spice', aliases: ['star anise powder', 'bot hoi'] },
  { name: 'Bột thảo quả', category: 'spice', aliases: ['cardamom powder', 'bot thao qua'] },
  { name: 'Bột đinh hương', category: 'spice', aliases: ['clove powder', 'bot dinh huong'] },
  { name: 'Lá nguyệt quế', category: 'spice', aliases: ['bay leaves', 'la nguyet que'] },
  { name: 'Lá thyme', category: 'spice', aliases: ['thyme leaves', 'la thyme'] },
  { name: 'Lá oregano', category: 'spice', aliases: ['oregano leaves', 'la oregano'] },
  { name: 'Lá rosemary', category: 'spice', aliases: ['rosemary leaves', 'la rosemary'] },
  { name: 'Hạt coriander', category: 'spice', aliases: ['coriander seeds', 'hat coriander'] },
  { name: 'Hạt cumin', category: 'spice', aliases: ['cumin seeds', 'hat cumin'] },
  { name: 'Hạt fennel', category: 'spice', aliases: ['fennel seeds', 'hat fennel'] },
  { name: 'Hạt mù tạt', category: 'spice', aliases: ['mustard seeds', 'hat mu tat'] },

  // Additional Beverages
  { name: 'Trà xanh', category: 'beverage', aliases: ['green tea', 'tra xanh'] },
  { name: 'Trà đen', category: 'beverage', aliases: ['black tea', 'tra den'] },
  { name: 'Trà ô long', category: 'beverage', aliases: ['oolong tea', 'tra o long'] },
  { name: 'Trà sen', category: 'beverage', aliases: ['lotus tea', 'tra sen'] },
  { name: 'Trà nhài', category: 'beverage', aliases: ['jasmine tea', 'tra nhai'] },
  { name: 'Cà phê đen', category: 'beverage', aliases: ['black coffee', 'ca phe den'] },
  { name: 'Cà phê sữa', category: 'beverage', aliases: ['coffee with milk', 'ca phe sua'] },
  { name: 'Cà phê phin', category: 'beverage', aliases: ['drip coffee', 'ca phe phin'] },
  { name: 'Nước chanh', category: 'beverage', aliases: ['lemon water', 'nuoc chanh'] },
  { name: 'Nước cam', category: 'beverage', aliases: ['orange juice', 'nuoc cam'] },
  { name: 'Nước ép', category: 'beverage', aliases: ['fruit juice', 'nuoc ep'] },
  { name: 'Nước ngọt có ga', category: 'beverage', aliases: ['carbonated drink', 'nuoc ngot co ga'] },
  { name: 'Bia hơi', category: 'beverage', aliases: ['draft beer', 'bia hoi'] },
  { name: 'Bia chai', category: 'beverage', aliases: ['bottled beer', 'bia chai'] },
  { name: 'Rượu cần', category: 'beverage', aliases: ['rice wine', 'ruou can'] },
  { name: 'Rượu đế', category: 'beverage', aliases: ['rice liquor', 'ruou de'] },
  { name: 'Rượu vang', category: 'beverage', aliases: ['wine', 'ruou vang'] },
  { name: 'Whisky', category: 'beverage', aliases: ['whiskey'] },
  { name: 'Vodka', category: 'beverage', aliases: ['vodka'] },
  { name: 'Brandy', category: 'beverage', aliases: ['brandy'] },

  // Additional Nuts & Seeds
  { name: 'Hạt chia', category: 'nut', aliases: ['chia seeds', 'hat chia'] },
  { name: 'Hạt lanh', category: 'nut', aliases: ['flax seeds', 'hat lanh'] },
  { name: 'Hạt quinoa', category: 'nut', aliases: ['quinoa seeds', 'hat quinoa'] },
  { name: 'Hạt hạnh nhân', category: 'nut', aliases: ['almond nuts', 'hat hanh nhan'] },
  { name: 'Hạt óc chó', category: 'nut', aliases: ['walnut', 'hat oc cho'] },
  { name: 'Hạt brazil', category: 'nut', aliases: ['brazil nuts', 'hat brazil'] },
  { name: 'Hạt pecan', category: 'nut', aliases: ['pecan nuts', 'hat pecan'] },
  { name: 'Hạt pine', category: 'nut', aliases: ['pine nuts', 'hat pine'] },
  { name: 'Hạt pistache', category: 'nut', aliases: ['pistachio', 'hat pistache'] },
  { name: 'Hạt dẻ cười', category: 'nut', aliases: ['pistachio', 'hat de cuoi'] },
  { name: 'Hạt mắc ca', category: 'nut', aliases: ['macadamia nuts', 'hat mac ca'] },
  { name: 'Hạt dưa hấu', category: 'nut', aliases: ['watermelon seeds', 'hat dua hau'] },
  { name: 'Hạt dưa gang', category: 'nut', aliases: ['pumpkin seeds', 'hat dua gang'] },
  { name: 'Hạt mè đen', category: 'nut', aliases: ['black sesame', 'hat me den'] },
  { name: 'Hạt mè trắng', category: 'nut', aliases: ['white sesame', 'hat me trang'] },

  // Traditional Vietnamese Ingredients
  { name: 'Bánh phồng tôm', category: 'processed', aliases: ['shrimp crackers', 'banh phong tom'] },
  { name: 'Bánh tráng me', category: 'processed', aliases: ['tamarind rice paper', 'banh trang me'] },
  { name: 'Bánh tráng nướng mè', category: 'processed', aliases: ['sesame grilled rice paper', 'banh trang nuong me'] },
  { name: 'Bánh ướt', category: 'processed', aliases: ['wet rice paper', 'banh uot'] },
  { name: 'Bánh flan', category: 'processed', aliases: ['flan cake', 'banh flan'] },
  { name: 'Bánh bông lan', category: 'processed', aliases: ['sponge cake', 'banh bong lan'] },
  { name: 'Bánh su kem', category: 'processed', aliases: ['cream puff', 'banh su kem'] },
  { name: 'Bánh tiramisu', category: 'processed', aliases: ['tiramisu cake', 'banh tiramisu'] },
  { name: 'Bánh chocolate', category: 'processed', aliases: ['chocolate cake', 'banh chocolate'] },
  { name: 'Bánh kem', category: 'processed', aliases: ['cream cake', 'banh kem'] },
  { name: 'Bánh quy', category: 'processed', aliases: ['cookies', 'banh quy'] },
  { name: 'Bánh cracker', category: 'processed', aliases: ['crackers', 'banh cracker'] },
  { name: 'Kẹo', category: 'processed', aliases: ['candy', 'keo'] },
  { name: 'Kẹo dẻo', category: 'processed', aliases: ['gummy candy', 'keo deo'] },
  { name: 'Kẹo cứng', category: 'processed', aliases: ['hard candy', 'keo cung'] },
  { name: 'Socola', category: 'processed', aliases: ['chocolate', 'socola'] },
  { name: 'Kem lạnh', category: 'processed', aliases: ['ice cream', 'kem lanh'] },
  { name: 'Kem que', category: 'processed', aliases: ['popsicle', 'kem que'] },
  { name: 'Yaourt', category: 'processed', aliases: ['yogurt', 'yaourt'] },
  { name: 'Pho mai que', category: 'processed', aliases: ['string cheese', 'pho mai que'] },
  { name: 'Pho mai lát', category: 'processed', aliases: ['sliced cheese', 'pho mai lat'] },

  // Additional Regional Specialties
  { name: 'Bánh chay', category: 'processed', aliases: ['vegetarian cake', 'banh chay'] },
  { name: 'Bánh dày', category: 'processed', aliases: ['thick rice cake', 'banh day'] },
  { name: 'Bánh giò', category: 'processed', aliases: ['pyramid dumpling', 'banh gio'] },
  { name: 'Bánh pía', category: 'processed', aliases: ['pia cake', 'banh pia'] },
  { name: 'Bánh in', category: 'processed', aliases: ['molded cake', 'banh in'] },
  { name: 'Bánh đúc', category: 'processed', aliases: ['plain rice cake', 'banh duc'] },
  { name: 'Bánh khúc', category: 'processed', aliases: ['cudweed cake', 'banh khuc'] },
  { name: 'Bánh rán', category: 'processed', aliases: ['fried cake', 'banh ran'] },
  { name: 'Bánh cam', category: 'processed', aliases: ['orange cake', 'banh cam'] },
  { name: 'Bánh cốm', category: 'processed', aliases: ['green rice cake', 'banh com'] },
  { name: 'Bánh đậu xanh', category: 'processed', aliases: ['mung bean cake', 'banh dau xanh'] },
  { name: 'Bánh dẻo', category: 'processed', aliases: ['soft cake', 'banh deo'] },
  { name: 'Bánh nướng', category: 'processed', aliases: ['baked cake', 'banh nuong'] },
  { name: 'Bánh trôi', category: 'processed', aliases: ['floating cake', 'banh troi'] },
  { name: 'Bánh chưng nướng', category: 'processed', aliases: ['grilled sticky rice cake', 'banh chung nuong'] },
  { name: 'Bánh tét lá cẩm', category: 'processed', aliases: ['purple sticky rice cake', 'banh tet la cam'] },
  { name: 'Bánh ít lá gai', category: 'processed', aliases: ['thorny leaf dumpling', 'banh it la gai'] },
  { name: 'Bánh bột lọc', category: 'processed', aliases: ['tapioca dumpling', 'banh bot loc'] },
  { name: 'Bánh ram ít', category: 'processed', aliases: ['fried dumpling', 'banh ram it'] },
  { name: 'Bánh căn nướng', category: 'processed', aliases: ['grilled mini pancake', 'banh can nuong'] },

  // More Seafood Varieties
  { name: 'Cá cơm', category: 'seafood', aliases: ['anchovy', 'ca com'] },
  { name: 'Cá cháy', category: 'seafood', aliases: ['burnt fish', 'ca chay'] },
  { name: 'Cá khô', category: 'seafood', aliases: ['dried fish', 'ca kho'] },
  { name: 'Cá một nắng', category: 'seafood', aliases: ['half-dried fish', 'ca mot nang'] },
  { name: 'Cá nướng', category: 'seafood', aliases: ['grilled fish', 'ca nuong'] },
  { name: 'Cá sống', category: 'seafood', aliases: ['raw fish', 'ca song'] },
  { name: 'Cá tươi', category: 'seafood', aliases: ['fresh fish', 'ca tuoi'] },
  { name: 'Tôm nướng', category: 'seafood', aliases: ['grilled shrimp', 'tom nuong'] },
  { name: 'Tôm luộc', category: 'seafood', aliases: ['boiled shrimp', 'tom luoc'] },
  { name: 'Tôm rang', category: 'seafood', aliases: ['fried shrimp', 'tom rang'] },
  { name: 'Cua rang', category: 'seafood', aliases: ['fried crab', 'cua rang'] },
  { name: 'Cua luộc', category: 'seafood', aliases: ['boiled crab', 'cua luoc'] },
  { name: 'Mực nướng', category: 'seafood', aliases: ['grilled squid', 'muc nuong'] },
  { name: 'Mực rang', category: 'seafood', aliases: ['fried squid', 'muc rang'] },
  { name: 'Ốc luộc', category: 'seafood', aliases: ['boiled snail', 'oc luoc'] },
  { name: 'Ốc nướng', category: 'seafood', aliases: ['grilled snail', 'oc nuong'] },
  { name: 'Sò nướng', category: 'seafood', aliases: ['grilled oyster', 'so nuong'] },
  { name: 'Sò luộc', category: 'seafood', aliases: ['boiled oyster', 'so luoc'] },
  { name: 'Nghêu hấp', category: 'seafood', aliases: ['steamed clam', 'ngheu hap'] },
  { name: 'Nghêu nướng', category: 'seafood', aliases: ['grilled clam', 'ngheu nuong'] },

  // More Meat Preparations
  { name: 'Thịt nướng', category: 'meat', aliases: ['grilled meat', 'thit nuong'] },
  { name: 'Thịt luộc', category: 'meat', aliases: ['boiled meat', 'thit luoc'] },
  { name: 'Thịt rang', category: 'meat', aliases: ['fried meat', 'thit rang'] },
  { name: 'Thịt hầm', category: 'meat', aliases: ['braised meat', 'thit ham'] },
  { name: 'Thịt quay', category: 'meat', aliases: ['roasted meat', 'thit quay'] },
  { name: 'Thịt hun khói', category: 'meat', aliases: ['smoked meat', 'thit hun khoi'] },
  { name: 'Thịt muối', category: 'meat', aliases: ['salted meat', 'thit muoi'] },
  { name: 'Thịt khô', category: 'meat', aliases: ['dried meat', 'thit kho'] },
  { name: 'Thịt tươi', category: 'meat', aliases: ['fresh meat', 'thit tuoi'] },
  { name: 'Thịt đông', category: 'meat', aliases: ['frozen meat', 'thit dong'] },
  { name: 'Xúc xích nướng', category: 'meat', aliases: ['grilled sausage', 'xuc xich nuong'] },
  { name: 'Xúc xích chiên', category: 'meat', aliases: ['fried sausage', 'xuc xich chien'] },
  { name: 'Chả cá nướng', category: 'meat', aliases: ['grilled fish cake', 'cha ca nuong'] },
  { name: 'Chả cá chiên', category: 'meat', aliases: ['fried fish cake', 'cha ca chien'] },
  { name: 'Nem nướng lá chuối', category: 'meat', aliases: ['banana leaf grilled pork', 'nem nuong la chuoi'] },
  { name: 'Nem nướng xiên', category: 'meat', aliases: ['skewered grilled pork', 'nem nuong xien'] },

  // Additional Condiments and Sauces
  { name: 'Tương chấm', category: 'spice', aliases: ['dipping sauce', 'tuong cham'] },
  { name: 'Nước chấm', category: 'spice', aliases: ['dipping sauce', 'nuoc cham'] },
  { name: 'Mắm chấm', category: 'spice', aliases: ['fermented dipping sauce', 'mam cham'] },
  { name: 'Tương ớt tỏi', category: 'spice', aliases: ['garlic chili sauce', 'tuong ot toi'] },
  { name: 'Tương ớt chanh', category: 'spice', aliases: ['lime chili sauce', 'tuong ot chanh'] },
  { name: 'Mắm tôm chua', category: 'spice', aliases: ['sour shrimp paste', 'mam tom chua'] },
  { name: 'Mắm tôm ngọt', category: 'spice', aliases: ['sweet shrimp paste', 'mam tom ngot'] },
  { name: 'Nước mắm nhĩ', category: 'spice', aliases: ['premium fish sauce', 'nuoc mam nhi'] },
  { name: 'Nước mắm cá cơm', category: 'spice', aliases: ['anchovy fish sauce', 'nuoc mam ca com'] },
  { name: 'Nước mắm Phú Quốc', category: 'spice', aliases: ['phu quoc fish sauce', 'nuoc mam phu quoc'] },
];

// Function to normalize Vietnamese text for search
function normalizeVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

// Function to create DynamoDB items from ingredient data
function createIngredientItems(ingredients: MasterIngredientData[]): any[] {
  const items: any[] = [];
  const timestamp = new Date().toISOString();

  ingredients.forEach((ingredient) => {
    const ingredientId = uuidv4();
    const normalizedName = normalizeVietnamese(ingredient.name);

    // Main ingredient item
    const mainItem = {
      PK: `INGREDIENT#${ingredientId}`,
      SK: 'METADATA',
      entity_type: 'MASTER_INGREDIENT',
      ingredient_id: ingredientId,
      name: ingredient.name,
      normalized_name: normalizedName,
      category: ingredient.category,
      aliases: ingredient.aliases,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
      GSI1PK: `CATEGORY#${ingredient.category}`,
      GSI1SK: `NAME#${normalizedName}`,
      GSI2PK: 'INGREDIENT#SEARCH',
      GSI2SK: `NAME#${normalizedName}`,
    };

    items.push(mainItem);

    // Create search entries for aliases
    ingredient.aliases.forEach((alias) => {
      const normalizedAlias = normalizeVietnamese(alias);
      const aliasItem = {
        PK: `INGREDIENT#${ingredientId}`,
        SK: `ALIAS#${normalizedAlias}`,
        entity_type: 'INGREDIENT_ALIAS',
        ingredient_id: ingredientId,
        alias: alias,
        normalized_alias: normalizedAlias,
        main_name: ingredient.name,
        category: ingredient.category,
        created_at: timestamp,
        GSI2PK: 'INGREDIENT#SEARCH',
        GSI2SK: `NAME#${normalizedAlias}`,
      };
      items.push(aliasItem);
    });
  });

  return items;
}

// Function to batch write items to DynamoDB
async function batchWriteItems(items: any[]): Promise<void> {
  const BATCH_SIZE = 25; // DynamoDB batch write limit
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const putRequests = batch.map(item => ({
      PutRequest: { Item: item }
    }));

    try {
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: putRequests
        }
      }));
      
      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} written successfully (${batch.length} items)`);
    } catch (error) {
      console.error(`❌ Error writing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      throw error;
    }

    // Add delay to avoid throttling
    if (i + BATCH_SIZE < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Main seeding function
async function seedMasterIngredients(): Promise<void> {
  try {
    console.log('🌱 Starting master ingredients seeding...');
    console.log(`📊 Total ingredients to seed: ${VIETNAMESE_INGREDIENTS.length}`);

    const items = createIngredientItems(VIETNAMESE_INGREDIENTS);
    console.log(`📦 Total DynamoDB items to create: ${items.length}`);

    await batchWriteItems(items);

    console.log('✅ Master ingredients seeding completed successfully!');
    console.log(`📈 Statistics:`);
    console.log(`   - Ingredients: ${VIETNAMESE_INGREDIENTS.length}`);
    console.log(`   - Total items: ${items.length}`);
    const categories = Array.from(new Set(VIETNAMESE_INGREDIENTS.map(i => i.category)));
    console.log(`   - Categories: ${categories.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error seeding master ingredients:', error);
    process.exit(1);
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedMasterIngredients()
    .then(() => {
      console.log('🎉 Seeding process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding process failed:', error);
      process.exit(1);
    });
}

export { seedMasterIngredients, VIETNAMESE_INGREDIENTS, normalizeVietnamese };