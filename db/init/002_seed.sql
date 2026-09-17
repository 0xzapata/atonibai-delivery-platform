-- KaonCDO food-delivery POC — seed (t2-db-seed)
-- Loaded by postgres /docker-entrypoint-initdb.d on first init (after 001_schema.sql).
-- Plain SQL only (no psql backslash commands). All geography via ST_GeogFromText.
-- Order math: total = items sum + delivery_fee + service_fee - discount.

BEGIN;

-- Users: 5 buyers, 4 riders, 3 owners, 1 operator, 1 support ----------------
INSERT INTO users (id, name, email, phone, password_hash, role, avatar) VALUES
  ('11111111-1111-1111-1111-000000000001', 'Maria Santos', 'maria@example.com', '+639051110001', 'stub', 'buyer', 'https://picsum.photos/seed/maria/200/200'),
  ('11111111-1111-1111-1111-000000000002', 'Jose Ramos', 'jose@example.com', '+639051110002', 'stub', 'buyer', 'https://picsum.photos/seed/jose/200/200'),
  ('11111111-1111-1111-1111-000000000003', 'Ana Lim', 'ana@example.com', '+639051110003', 'stub', 'buyer', 'https://picsum.photos/seed/ana/200/200'),
  ('11111111-1111-1111-1111-000000000004', 'Pedro Cruz', 'pedro@example.com', '+639051110004', 'stub', 'buyer', 'https://picsum.photos/seed/pedro/200/200'),
  ('11111111-1111-1111-1111-000000000005', 'Lia Tan', 'lia@example.com', '+639051110005', 'stub', 'buyer', 'https://picsum.photos/seed/lia/200/200'),
  ('11111111-1111-1111-1111-000000000006', 'Ramon Dela Cruz', 'ramon@example.com', '+639051110006', 'stub', 'rider', 'https://picsum.photos/seed/ramon/200/200'),
  ('11111111-1111-1111-1111-000000000007', 'Jay Morales', 'jay@example.com', '+639051110007', 'stub', 'rider', 'https://picsum.photos/seed/jay/200/200'),
  ('11111111-1111-1111-1111-000000000008', 'Cris Aquino', 'cris@example.com', '+639051110008', 'stub', 'rider', 'https://picsum.photos/seed/cris/200/200'),
  ('11111111-1111-1111-1111-000000000009', 'Ben Torres', 'ben@example.com', '+639051110009', 'stub', 'rider', 'https://picsum.photos/seed/ben/200/200'),
  ('11111111-1111-1111-1111-000000000010', 'Olivia Sy', 'owner1@example.com', '+639051110010', 'stub', 'store_owner', 'https://picsum.photos/seed/owner1/200/200'),
  ('11111111-1111-1111-1111-000000000011', 'Marco Uy', 'owner2@example.com', '+639051110011', 'stub', 'store_owner', 'https://picsum.photos/seed/owner2/200/200'),
  ('11111111-1111-1111-1111-000000000012', 'Nadia Reyes', 'owner3@example.com', '+639051110012', 'stub', 'store_owner', 'https://picsum.photos/seed/owner3/200/200'),
  ('11111111-1111-1111-1111-000000000013', 'Ops Manager', 'operator@example.com', '+639051110013', 'stub', 'operator', 'https://picsum.photos/seed/operator/200/200'),
  ('11111111-1111-1111-1111-000000000014', 'Support Agent', 'support@example.com', '+639051110014', 'stub', 'support', 'https://picsum.photos/seed/support/200/200');

-- Rider profiles: 3 online around CDO, 1 offline -----------------------------
INSERT INTO rider_profiles (user_id, vehicle, plate, status, last_location) VALUES
  ('11111111-1111-1111-1111-000000000006', 'moto', 'ABC 1234', 'online', ST_GeogFromText('SRID=4326;POINT(124.6485 8.4855)')),
  ('11111111-1111-1111-1111-000000000007', 'moto', 'XYZ 5678', 'online', ST_GeogFromText('SRID=4326;POINT(124.6455 8.4830)')),
  ('11111111-1111-1111-1111-000000000008', 'bicycle', 'N/A', 'online', ST_GeogFromText('SRID=4326;POINT(124.6510 8.4815)')),
  ('11111111-1111-1111-1111-000000000009', 'moto', 'QWE 9012', 'offline', NULL);

-- Stores: 6 CDO spots, 2 per owner ------------------------------------------
INSERT INTO stores (id, owner_id, name, cuisine, image, rating, delivery_fee, location, service_radius_m, is_open) VALUES
  ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000010', 'CDOplibee', 'fastfood', 'https://picsum.photos/seed/cdoplibee/400/300', 4.6, 39, ST_GeogFromText('SRID=4326;POINT(124.6480 8.4861)'), 8000, true),
  ('22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000010', 'Wolf Cafe', 'western', 'https://picsum.photos/seed/wolfcafe/400/300', 4.7, 39, ST_GeogFromText('SRID=4326;POINT(124.6500 8.4845)'), 8000, true),
  ('22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000011', 'Mang BBQ', 'filipino', 'https://picsum.photos/seed/mangbbq/400/300', 4.5, 39, ST_GeogFromText('SRID=4326;POINT(124.6460 8.4820)'), 8000, true),
  ('22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000011', 'TeaSoul', 'milktea', 'https://picsum.photos/seed/teasoul/400/300', 4.6, 39, ST_GeogFromText('SRID=4326;POINT(124.6440 8.4870)'), 8000, true),
  ('22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000012', 'Reyes Lechon', 'filipino', 'https://picsum.photos/seed/reyeslechon/400/300', 4.8, 39, ST_GeogFromText('SRID=4326;POINT(124.6420 8.4800)'), 8000, true),
  ('22222222-2222-2222-2222-000000000006', '11111111-1111-1111-1111-000000000012', 'GreenBowls', 'vegan', 'https://picsum.photos/seed/greenbowls/400/300', 4.4, 39, ST_GeogFromText('SRID=4326;POINT(124.6490 8.4790)'), 8000, true);

-- Menu categories: 2 per store ----------------------------------------------
INSERT INTO menu_categories (id, store_id, name, sort) VALUES
  ('33333333-3333-3333-3333-000000000001', '22222222-2222-2222-2222-000000000001', 'Burgers', 1),
  ('33333333-3333-3333-3333-000000000002', '22222222-2222-2222-2222-000000000001', 'Chicken and Sides', 2),
  ('33333333-3333-3333-3333-000000000003', '22222222-2222-2222-2222-000000000002', 'Mains', 1),
  ('33333333-3333-3333-3333-000000000004', '22222222-2222-2222-2222-000000000002', 'Desserts and Drinks', 2),
  ('33333333-3333-3333-3333-000000000005', '22222222-2222-2222-2222-000000000003', 'Inihaw', 1),
  ('33333333-3333-3333-3333-000000000006', '22222222-2222-2222-2222-000000000003', 'Rice Meals and Dessert', 2),
  ('33333333-3333-3333-3333-000000000007', '22222222-2222-2222-2222-000000000004', 'Milk Tea', 1),
  ('33333333-3333-3333-3333-000000000008', '22222222-2222-2222-2222-000000000004', 'Fruit Tea and Snacks', 2),
  ('33333333-3333-3333-3333-000000000009', '22222222-2222-2222-2222-000000000005', 'Lechon Packs', 1),
  ('33333333-3333-3333-3333-000000000010', '22222222-2222-2222-2222-000000000005', 'Ulam and Dessert', 2),
  ('33333333-3333-3333-3333-000000000011', '22222222-2222-2222-2222-000000000006', 'Bowls', 1),
  ('33333333-3333-3333-3333-000000000012', '22222222-2222-2222-2222-000000000006', 'Smoothies', 2);

-- Menu items: 5 per store, whole-peso prices --------------------------------
INSERT INTO menu_items (id, store_id, category_id, name, description, price, image, is_available, rating) VALUES
  ('44444444-4444-4444-4444-000000000001', '22222222-2222-2222-2222-000000000001', '33333333-3333-3333-3333-000000000002', 'Crispy Fried Chicken 1pc', 'Crispy, juicy 1-pc fried chicken with gravy.', 129, 'https://picsum.photos/seed/cdoplibee-fried-chicken/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000002', '22222222-2222-2222-2222-000000000001', '33333333-3333-3333-3333-000000000002', 'Jolly Spaghetti', 'Sweet-style spaghetti with hotdog slices and cheese.', 99, 'https://picsum.photos/seed/cdoplibee-spaghetti/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000003', '22222222-2222-2222-2222-000000000001', '33333333-3333-3333-3333-000000000001', 'Champ Burger', 'Quarter-pound beef patty with cheese, lettuce, and tomato.', 149, 'https://picsum.photos/seed/cdoplibee-champ-burger/400/300', true, 4.8),
  ('44444444-4444-4444-4444-000000000004', '22222222-2222-2222-2222-000000000001', '33333333-3333-3333-3333-000000000002', 'Peach Mango Pie', 'Crispy pocket pie with peach-mango filling.', 59, 'https://picsum.photos/seed/cdoplibee-peach-mango-pie/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000005', '22222222-2222-2222-2222-000000000001', '33333333-3333-3333-3333-000000000001', 'Chicken Sandwich', 'Crispy chicken fillet sandwich with honey dressing.', 119, 'https://picsum.photos/seed/cdoplibee-chicken-sandwich/400/300', true, 4.4),
  ('44444444-4444-4444-4444-000000000006', '22222222-2222-2222-2222-000000000002', '33333333-3333-3333-3333-000000000003', 'Garlic Butter Shrimp Pasta', 'Pasta tossed in garlic butter with shrimp.', 249, 'https://picsum.photos/seed/wolf-shrimp-pasta/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000007', '22222222-2222-2222-2222-000000000002', '33333333-3333-3333-3333-000000000003', 'Grilled Chicken Steak', 'Char-grilled chicken steak with choice of side.', 229, 'https://picsum.photos/seed/wolf-chicken-steak/400/300', true, 4.8),
  ('44444444-4444-4444-4444-000000000008', '22222222-2222-2222-2222-000000000002', '33333333-3333-3333-3333-000000000003', 'Truffle Fries', 'Crispy fries with truffle oil and parmesan.', 149, 'https://picsum.photos/seed/wolf-truffle-fries/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000009', '22222222-2222-2222-2222-000000000002', '33333333-3333-3333-3333-000000000004', 'Chocolate Lava Cake', 'Warm chocolate cake with a molten center.', 139, 'https://picsum.photos/seed/wolf-lava-cake/400/300', true, 4.9),
  ('44444444-4444-4444-4444-000000000010', '22222222-2222-2222-2222-000000000002', '33333333-3333-3333-3333-000000000004', 'Iced Caramel Latte', 'Double-shot espresso with caramel over ice.', 129, 'https://picsum.photos/seed/wolf-caramel-latte/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000011', '22222222-2222-2222-2222-000000000003', '33333333-3333-3333-3333-000000000005', 'Pork BBQ on a Stick (3 pcs)', 'Smoky-sweet grilled pork barbecue, 3 sticks.', 120, 'https://picsum.photos/seed/mangbbq-pork-bbq/400/300', true, 4.8),
  ('44444444-4444-4444-4444-000000000012', '22222222-2222-2222-2222-000000000003', '33333333-3333-3333-3333-000000000005', 'Grilled Bangus', 'Boneless milkfish grilled with calamansi-soy.', 199, 'https://picsum.photos/seed/mangbbq-bangus/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000013', '22222222-2222-2222-2222-000000000003', '33333333-3333-3333-3333-000000000005', 'Chicken Inasal', 'Annatto-marinated grilled chicken, paa or pecho.', 169, 'https://picsum.photos/seed/mangbbq-inasal/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000014', '22222222-2222-2222-2222-000000000003', '33333333-3333-3333-3333-000000000006', 'Pork Sisig Rice Meal', 'Sizzling pork sisig with egg over garlic rice.', 149, 'https://picsum.photos/seed/mangbbq-sisig-meal/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000015', '22222222-2222-2222-2222-000000000003', '33333333-3333-3333-3333-000000000006', 'Special Halo-Halo', 'Shaved ice with leche flan, ube, and pinipig.', 129, 'https://picsum.photos/seed/mangbbq-halo-halo/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000016', '22222222-2222-2222-2222-000000000004', '33333333-3333-3333-3333-000000000007', 'Okinawa Milk Tea', 'Roasted brown-sugar milk tea with pearls.', 119, 'https://picsum.photos/seed/teasoul-okinawa/400/300', true, 4.8),
  ('44444444-4444-4444-4444-000000000017', '22222222-2222-2222-2222-000000000004', '33333333-3333-3333-3333-000000000007', 'Wintermelon Milk Tea', 'Classic wintermelon milk tea with pearls.', 109, 'https://picsum.photos/seed/teasoul-wintermelon/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000018', '22222222-2222-2222-2222-000000000004', '33333333-3333-3333-3333-000000000007', 'Brown Sugar Boba', 'Fresh milk with brown-sugar boba.', 139, 'https://picsum.photos/seed/teasoul-brown-sugar/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000019', '22222222-2222-2222-2222-000000000004', '33333333-3333-3333-3333-000000000008', 'Mango Fruit Tea', 'Green tea with ripe mango and nata.', 115, 'https://picsum.photos/seed/teasoul-mango-tea/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000020', '22222222-2222-2222-2222-000000000004', '33333333-3333-3333-3333-000000000008', 'Takoyaki (4 pcs)', 'Octopus balls with bonito flakes and mayo.', 99, 'https://picsum.photos/seed/teasoul-takoyaki/400/300', true, 4.4),
  ('44444444-4444-4444-4444-000000000021', '22222222-2222-2222-2222-000000000005', '33333333-3333-3333-3333-000000000009', 'Lechon Belly 250g', 'Slow-roasted pork belly, good for 1 to 2.', 299, 'https://picsum.photos/seed/reyes-lechon-belly/400/300', true, 4.9),
  ('44444444-4444-4444-4444-000000000022', '22222222-2222-2222-2222-000000000005', '33333333-3333-3333-3333-000000000009', 'Lechon Kawali Rice Meal', 'Crispy lechon kawali over rice with liver sauce.', 159, 'https://picsum.photos/seed/reyes-kawali-meal/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000023', '22222222-2222-2222-2222-000000000005', '33333333-3333-3333-3333-000000000010', 'Sinigang na Baboy', 'Sour tamarind pork soup with kangkong.', 189, 'https://picsum.photos/seed/reyes-sinigang/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000024', '22222222-2222-2222-2222-000000000005', '33333333-3333-3333-3333-000000000010', 'Crispy Pata', 'Deep-fried pork leg, good for 2 to 3.', 549, 'https://picsum.photos/seed/reyes-crispy-pata/400/300', true, 4.8),
  ('44444444-4444-4444-4444-000000000025', '22222222-2222-2222-2222-000000000005', '33333333-3333-3333-3333-000000000010', 'Leche Flan', 'Silky caramel custard.', 99, 'https://picsum.photos/seed/reyes-leche-flan/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000026', '22222222-2222-2222-2222-000000000006', '33333333-3333-3333-3333-000000000011', 'Buddha Bowl', 'Quinoa, roasted veggies, chickpeas, and tahini.', 189, 'https://picsum.photos/seed/greenbowls-buddha/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000027', '22222222-2222-2222-2222-000000000006', '33333333-3333-3333-3333-000000000011', 'Tofu Sisig Bowl', 'Sizzling tofu sisig over brown rice.', 169, 'https://picsum.photos/seed/greenbowls-tofu-sisig/400/300', true, 4.7),
  ('44444444-4444-4444-4444-000000000028', '22222222-2222-2222-2222-000000000006', '33333333-3333-3333-3333-000000000011', 'Kangkong Pesto Pasta', 'Pasta in kangkong-cashew pesto.', 179, 'https://picsum.photos/seed/greenbowls-pesto/400/300', true, 4.5),
  ('44444444-4444-4444-4444-000000000029', '22222222-2222-2222-2222-000000000006', '33333333-3333-3333-3333-000000000012', 'Mango Chia Smoothie', 'Mango, coconut milk, and chia seeds.', 139, 'https://picsum.photos/seed/greenbowls-mango-smoothie/400/300', true, 4.6),
  ('44444444-4444-4444-4444-000000000030', '22222222-2222-2222-2222-000000000006', '33333333-3333-3333-3333-000000000012', 'Banana Oat Smoothie', 'Banana, oats, peanut butter, and soy milk.', 129, 'https://picsum.photos/seed/greenbowls-banana-smoothie/400/300', true, 4.4);

-- Item options on 3 popular items -------------------------------------------
INSERT INTO item_options (id, item_id, name, required, multi) VALUES
  ('55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000003', 'Up-size', false, false),
  ('55555555-5555-5555-5555-000000000002', '44444444-4444-4444-4444-000000000003', 'Add-ons', false, true),
  ('55555555-5555-5555-5555-000000000003', '44444444-4444-4444-4444-000000000007', 'Sides', true, false),
  ('55555555-5555-5555-5555-000000000004', '44444444-4444-4444-4444-000000000016', 'Size', true, false),
  ('55555555-5555-5555-5555-000000000005', '44444444-4444-4444-4444-000000000016', 'Sinkers', false, true);

INSERT INTO option_choices (id, option_id, name, price_delta) VALUES
  ('66666666-6666-6666-6666-000000000001', '55555555-5555-5555-5555-000000000001', 'Single', 0),
  ('66666666-6666-6666-6666-000000000002', '55555555-5555-5555-5555-000000000001', 'Double', 60),
  ('66666666-6666-6666-6666-000000000003', '55555555-5555-5555-5555-000000000002', 'Extra Cheese', 25),
  ('66666666-6666-6666-6666-000000000004', '55555555-5555-5555-5555-000000000002', 'Bacon', 35),
  ('66666666-6666-6666-6666-000000000005', '55555555-5555-5555-5555-000000000002', 'Fried Egg', 20),
  ('66666666-6666-6666-6666-000000000006', '55555555-5555-5555-5555-000000000003', 'Garlic Rice', 0),
  ('66666666-6666-6666-6666-000000000007', '55555555-5555-5555-5555-000000000003', 'Mashed Potato', 20),
  ('66666666-6666-6666-6666-000000000008', '55555555-5555-5555-5555-000000000003', 'Buttered Veggies', 20),
  ('66666666-6666-6666-6666-000000000009', '55555555-5555-5555-5555-000000000004', '16 oz', 0),
  ('66666666-6666-6666-6666-000000000010', '55555555-5555-5555-5555-000000000004', '22 oz', 20),
  ('66666666-6666-6666-6666-000000000011', '55555555-5555-5555-5555-000000000005', 'Pearls', 15),
  ('66666666-6666-6666-6666-000000000012', '55555555-5555-5555-5555-000000000005', 'Nata', 15),
  ('66666666-6666-6666-6666-000000000013', '55555555-5555-5555-5555-000000000005', 'Cream Cheese', 25);

-- Promotions -----------------------------------------------------------------
INSERT INTO promotions (code, kind, value, max_discount, min_order, active) VALUES
  ('KAON20', 'percent', 20, 100, 150, true),
  ('FREESHIP', 'freeship', 0, 39, 200, true);

-- Orders: 6 delivered (past 7 days) + 1 preparing + 1 delivering -------------
-- Totals: total = subtotal + delivery_fee + service_fee - discount.
INSERT INTO orders (id, buyer_id, store_id, status, subtotal, delivery_fee, service_fee, discount, total, promo_code, payment_method, payment_status, pickup_pin, eta_min, buyer_lat, buyer_lng, timeline, created_at, updated_at) VALUES
  -- H1: 149 + 2x59 = 267; 267 + 39 + 10 - 53 (KAON20) = 263
  ('77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'delivered', 267, 39, 10, 53, 263, 'KAON20', 'gcash', 'paid', '1234', 35, 8.4875, 124.6470,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '6 days')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '6 days' + interval '4 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '6 days' + interval '25 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '6 days' + interval '45 minutes')::text)),
   now() - interval '6 days', now() - interval '6 days' + interval '45 minutes'),
  -- H2: 249 + 129 = 378; 378 + 39 + 12 - 0 = 429
  ('77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000002', 'delivered', 378, 39, 12, 0, 429, NULL, 'cod', 'paid', '2345', 40, 8.4855, 124.6515,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '5 days')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '5 days' + interval '5 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '5 days' + interval '30 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '5 days' + interval '55 minutes')::text)),
   now() - interval '5 days', now() - interval '5 days' + interval '55 minutes'),
  -- H3: 2x120 + 129 = 369; 369 + 39 + 11 - 0 = 419
  ('77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000003', 'delivered', 369, 39, 11, 0, 419, NULL, 'card', 'paid', '3456', 30, 8.4810, 124.6450,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '4 days')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '4 days' + interval '3 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '4 days' + interval '22 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '4 days' + interval '40 minutes')::text)),
   now() - interval '4 days', now() - interval '4 days' + interval '40 minutes'),
  -- H4: 2x119 + 99 = 337; 337 + 39 + 10 - 39 (FREESHIP) = 347
  ('77777777-7777-7777-7777-000000000004', '11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000004', 'delivered', 337, 39, 10, 39, 347, 'FREESHIP', 'gcash', 'paid', '4567', 25, 8.4880, 124.6430,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '3 days')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '3 days' + interval '4 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '3 days' + interval '20 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '3 days' + interval '38 minutes')::text)),
   now() - interval '3 days', now() - interval '3 days' + interval '38 minutes'),
  -- H5: 159 + 99 = 258; 258 + 39 + 10 - 51 (KAON20) = 256
  ('77777777-7777-7777-7777-000000000005', '11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000005', 'delivered', 258, 39, 10, 51, 256, 'KAON20', 'cod', 'paid', '5678', 35, 8.4790, 124.6410,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '2 days')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '2 days' + interval '6 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '2 days' + interval '28 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '2 days' + interval '50 minutes')::text)),
   now() - interval '2 days', now() - interval '2 days' + interval '50 minutes'),
  -- H6: 189 + 139 = 328; 328 + 39 + 10 - 0 = 377
  ('77777777-7777-7777-7777-000000000006', '11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000006', 'delivered', 328, 39, 10, 0, 377, NULL, 'card', 'paid', '6789', 30, 8.4780, 124.6500,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '1 day')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '1 day' + interval '4 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '1 day' + interval '24 minutes')::text),
     jsonb_build_object('status', 'delivered', 'at', (now() - interval '1 day' + interval '44 minutes')::text)),
   now() - interval '1 day', now() - interval '1 day' + interval '44 minutes'),
  -- Live preparing: 149 + 99 = 248; 248 + 39 + 10 - 0 = 297
  ('77777777-7777-7777-7777-000000000007', '11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000001', 'preparing', 248, 39, 10, 0, 297, NULL, 'gcash', 'pending', '7310', 25, 8.4865, 124.6475,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '40 minutes')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '35 minutes')::text),
     jsonb_build_object('status', 'preparing', 'at', (now() - interval '25 minutes')::text)),
   now() - interval '40 minutes', now() - interval '25 minutes'),
  -- Live delivering: 229 + 149 = 378; 378 + 39 + 12 - 0 = 429
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000002', 'delivering', 378, 39, 12, 0, 429, NULL, 'cod', 'pending', '4821', 12, 8.4885, 124.6445,
   jsonb_build_array(
     jsonb_build_object('status', 'placed', 'at', (now() - interval '50 minutes')::text),
     jsonb_build_object('status', 'store_accepted', 'at', (now() - interval '46 minutes')::text),
     jsonb_build_object('status', 'preparing', 'at', (now() - interval '42 minutes')::text),
     jsonb_build_object('status', 'ready', 'at', (now() - interval '34 minutes')::text),
     jsonb_build_object('status', 'rider_assigned', 'at', (now() - interval '32 minutes')::text),
     jsonb_build_object('status', 'picked_up', 'at', (now() - interval '28 minutes')::text),
     jsonb_build_object('status', 'delivering', 'at', (now() - interval '26 minutes')::text)),
   now() - interval '50 minutes', now() - interval '26 minutes');

-- Order items: line_total = unit_price * qty --------------------------------
INSERT INTO order_items (id, order_id, item_id, name, unit_price, qty, options, line_total) VALUES
  ('88888888-8888-8888-8888-000000000001', '77777777-7777-7777-7777-000000000001', '44444444-4444-4444-4444-000000000003', 'Champ Burger', 149, 1, '[]', 149),
  ('88888888-8888-8888-8888-000000000002', '77777777-7777-7777-7777-000000000001', '44444444-4444-4444-4444-000000000004', 'Peach Mango Pie', 59, 2, '[]', 118),
  ('88888888-8888-8888-8888-000000000003', '77777777-7777-7777-7777-000000000002', '44444444-4444-4444-4444-000000000006', 'Garlic Butter Shrimp Pasta', 249, 1, '[]', 249),
  ('88888888-8888-8888-8888-000000000004', '77777777-7777-7777-7777-000000000002', '44444444-4444-4444-4444-000000000010', 'Iced Caramel Latte', 129, 1, '[]', 129),
  ('88888888-8888-8888-8888-000000000005', '77777777-7777-7777-7777-000000000003', '44444444-4444-4444-4444-000000000011', 'Pork BBQ on a Stick (3 pcs)', 120, 2, '[]', 240),
  ('88888888-8888-8888-8888-000000000006', '77777777-7777-7777-7777-000000000003', '44444444-4444-4444-4444-000000000015', 'Special Halo-Halo', 129, 1, '[]', 129),
  ('88888888-8888-8888-8888-000000000007', '77777777-7777-7777-7777-000000000004', '44444444-4444-4444-4444-000000000016', 'Okinawa Milk Tea', 119, 2, '[{"option": "Size", "choice": "16 oz", "price_delta": 0}]', 238),
  ('88888888-8888-8888-8888-000000000008', '77777777-7777-7777-7777-000000000004', '44444444-4444-4444-4444-000000000020', 'Takoyaki (4 pcs)', 99, 1, '[]', 99),
  ('88888888-8888-8888-8888-000000000009', '77777777-7777-7777-7777-000000000005', '44444444-4444-4444-4444-000000000022', 'Lechon Kawali Rice Meal', 159, 1, '[]', 159),
  ('88888888-8888-8888-8888-000000000010', '77777777-7777-7777-7777-000000000005', '44444444-4444-4444-4444-000000000025', 'Leche Flan', 99, 1, '[]', 99),
  ('88888888-8888-8888-8888-000000000011', '77777777-7777-7777-7777-000000000006', '44444444-4444-4444-4444-000000000026', 'Buddha Bowl', 189, 1, '[]', 189),
  ('88888888-8888-8888-8888-000000000012', '77777777-7777-7777-7777-000000000006', '44444444-4444-4444-4444-000000000029', 'Mango Chia Smoothie', 139, 1, '[]', 139),
  ('88888888-8888-8888-8888-000000000013', '77777777-7777-7777-7777-000000000007', '44444444-4444-4444-4444-000000000003', 'Champ Burger', 149, 1, '[]', 149),
  ('88888888-8888-8888-8888-000000000014', '77777777-7777-7777-7777-000000000007', '44444444-4444-4444-4444-000000000002', 'Jolly Spaghetti', 99, 1, '[]', 99),
  ('88888888-8888-8888-8888-000000000015', '77777777-7777-7777-7777-000000000008', '44444444-4444-4444-4444-000000000007', 'Grilled Chicken Steak', 229, 1, '[{"option": "Sides", "choice": "Garlic Rice", "price_delta": 0}]', 229),
  ('88888888-8888-8888-8888-000000000016', '77777777-7777-7777-7777-000000000008', '44444444-4444-4444-4444-000000000008', 'Truffle Fries', 149, 1, '[]', 149);

-- Payments: one per order, amount = order total -------------------------------
INSERT INTO payments (id, order_id, method, amount, status, ref_code, created_at) VALUES
  ('99999999-9999-9999-9999-000000000001', '77777777-7777-7777-7777-000000000001', 'gcash', 263, 'succeeded', 'GCASH-1001', now() - interval '6 days'),
  ('99999999-9999-9999-9999-000000000002', '77777777-7777-7777-7777-000000000002', 'cod', 429, 'succeeded', 'COD-1002', now() - interval '5 days'),
  ('99999999-9999-9999-9999-000000000003', '77777777-7777-7777-7777-000000000003', 'card', 419, 'succeeded', 'CARD-1003', now() - interval '4 days'),
  ('99999999-9999-9999-9999-000000000004', '77777777-7777-7777-7777-000000000004', 'gcash', 347, 'succeeded', 'GCASH-1004', now() - interval '3 days'),
  ('99999999-9999-9999-9999-000000000005', '77777777-7777-7777-7777-000000000005', 'cod', 256, 'succeeded', 'COD-1005', now() - interval '2 days'),
  ('99999999-9999-9999-9999-000000000006', '77777777-7777-7777-7777-000000000006', 'card', 377, 'succeeded', 'CARD-1006', now() - interval '1 day'),
  ('99999999-9999-9999-9999-000000000007', '77777777-7777-7777-7777-000000000007', 'gcash', 297, 'pending', 'GCASH-1007', now() - interval '40 minutes'),
  ('99999999-9999-9999-9999-000000000008', '77777777-7777-7777-7777-000000000008', 'cod', 429, 'pending', 'COD-1008', now() - interval '50 minutes');

-- Offers: accepted offer per fulfilled/delivering order ------------------------
INSERT INTO offers (id, order_id, rider_id, status, expires_at, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000006', 'accepted', now() - interval '6 days' + interval '11 minutes', now() - interval '6 days' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000007', 'accepted', now() - interval '5 days' + interval '11 minutes', now() - interval '5 days' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-000000000008', 'accepted', now() - interval '4 days' + interval '11 minutes', now() - interval '4 days' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '77777777-7777-7777-7777-000000000004', '11111111-1111-1111-1111-000000000007', 'accepted', now() - interval '3 days' + interval '11 minutes', now() - interval '3 days' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '77777777-7777-7777-7777-000000000005', '11111111-1111-1111-1111-000000000006', 'accepted', now() - interval '2 days' + interval '11 minutes', now() - interval '2 days' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000006', '77777777-7777-7777-7777-000000000006', '11111111-1111-1111-1111-000000000008', 'accepted', now() - interval '1 day' + interval '11 minutes', now() - interval '1 day' + interval '10 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000007', '77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', 'accepted', now() - interval '39 minutes', now() - interval '40 minutes');

-- Tracking: 5 pings for the live delivering order (Centrio -> Uptown) ----------
INSERT INTO delivery_tracking (order_id, rider_id, geom, heading, speed, at) VALUES
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', ST_GeogFromText('SRID=4326;POINT(124.6495 8.4849)'), 305.0, 6.5, now() - interval '25 minutes'),
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', ST_GeogFromText('SRID=4326;POINT(124.6485 8.4858)'), 307.5, 7.0, now() - interval '20 minutes'),
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', ST_GeogFromText('SRID=4326;POINT(124.6473 8.4867)'), 310.0, 6.8, now() - interval '15 minutes'),
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', ST_GeogFromText('SRID=4326;POINT(124.6460 8.4876)'), 312.5, 6.2, now() - interval '10 minutes'),
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000006', ST_GeogFromText('SRID=4326;POINT(124.6448 8.4883)'), 315.0, 5.5, now() - interval '5 minutes');

-- Reviews: 1 per historical order + 1 rider review on H1 -----------------------
INSERT INTO reviews (id, order_id, author_id, store_id, rider_id, rating, comment, created_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', NULL, 5, 'Super crispy chicken, arrived hot and fast.', now() - interval '6 days' + interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', '77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000001', NULL, '11111111-1111-1111-1111-000000000006', 5, 'Ramon was polite and followed the pickup PIN flow.', now() - interval '6 days' + interval '3 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000003', '77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000002', NULL, 4, 'Pasta was great, lava cake slightly cold.', now() - interval '5 days' + interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000004', '77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000003', NULL, 5, 'Inasal tasted like home. Halo-halo is a must.', now() - interval '4 days' + interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000005', '77777777-7777-7777-7777-000000000004', '11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000004', NULL, 4, 'Good milk tea, takoyaki sold me. Free delivery worked.', now() - interval '3 days' + interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000006', '77777777-7777-7777-7777-000000000005', '11111111-1111-1111-1111-000000000005', '22222222-2222-2222-2222-000000000005', NULL, 5, 'Lechon kawali stayed crispy. KAON20 discount applied.', now() - interval '2 days' + interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000007', '77777777-7777-7777-7777-000000000006', '11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000006', NULL, 4, 'Fresh bowls and fast prep. Smoothie a bit sweet.', now() - interval '1 day' + interval '2 hours');

-- Tickets: open (late rider) + pending (refund) + resolved ---------------------
INSERT INTO tickets (id, order_id, opener_id, subject, priority, status, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-000000000001', '77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000003', 'Rider running late for my Wolf Cafe order', 'high', 'open', now() - interval '15 minutes'),
  ('cccccccc-cccc-cccc-cccc-000000000002', '77777777-7777-7777-7777-000000000005', '11111111-1111-1111-1111-000000000005', 'Refund request: missing Leche Flan', 'normal', 'pending', now() - interval '1 day'),
  ('cccccccc-cccc-cccc-cccc-000000000003', '77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000002', 'Could not find pickup PIN in the app', 'low', 'resolved', now() - interval '4 days');

INSERT INTO ticket_messages (id, ticket_id, sender_role, body, created_at) VALUES
  ('dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'buyer', 'My food has been out for delivery for 25 minutes and the rider marker barely moved. Please check.', now() - interval '15 minutes'),
  ('dddddddd-dddd-dddd-dddd-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 'support', 'Thanks for flagging this. We pinged the rider and ops is watching your order live on the city map.', now() - interval '10 minutes'),
  ('dddddddd-dddd-dddd-dddd-000000000003', 'cccccccc-cccc-cccc-cccc-000000000002', 'buyer', 'My Leche Flan was missing from the bag. I would like a refund for that item.', now() - interval '1 day'),
  ('dddddddd-dddd-dddd-dddd-000000000004', 'cccccccc-cccc-cccc-cccc-000000000002', 'support', 'Confirmed with Reyes Lechon. We are processing a P99 refund to your GCash wallet.', now() - interval '20 hours'),
  ('dddddddd-dddd-dddd-dddd-000000000005', 'cccccccc-cccc-cccc-cccc-000000000003', 'buyer', 'The rider asked for a PIN but I could not find it anywhere in the track screen.', now() - interval '4 days'),
  ('dddddddd-dddd-dddd-dddd-000000000006', 'cccccccc-cccc-cccc-cccc-000000000003', 'support', 'The PIN is now shown at the top of the track screen once the store accepts. Marking this resolved.', now() - interval '4 days' + interval '2 hours');

COMMIT;
