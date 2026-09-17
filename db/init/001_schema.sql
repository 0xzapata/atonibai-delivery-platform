-- KaonCDO food-delivery POC — schema (t2-db-seed)
-- Loaded by postgres /docker-entrypoint-initdb.d on first init.
-- Postgres 16 + PostGIS. Plain SQL only (no psql backslash commands).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users / roles ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  phone         text,
  password_hash text        NOT NULL DEFAULT 'stub',
  role          text        NOT NULL CHECK (role IN ('buyer', 'store_owner', 'rider', 'operator', 'support')),
  avatar        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  vehicle       text        NOT NULL DEFAULT 'moto',
  plate         text,
  status        text        NOT NULL DEFAULT 'offline'
                CHECK (status IN ('offline', 'online', 'busy')),
  last_location geography(Point, 4326),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Stores & menu ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id               uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid                 REFERENCES users (id) ON DELETE SET NULL,
  name             text                 NOT NULL,
  cuisine          text                 NOT NULL,
  image            text,
  rating           numeric(2, 1)        NOT NULL DEFAULT 4.5 CHECK (rating >= 0 AND rating <= 5),
  delivery_fee     integer              NOT NULL DEFAULT 39 CHECK (delivery_fee >= 0),
  location         geography(Point, 4326) NOT NULL,
  service_radius_m integer              NOT NULL DEFAULT 8000 CHECK (service_radius_m > 0),
  is_open          boolean              NOT NULL DEFAULT true,
  created_at       timestamptz          NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid    NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name     text    NOT NULL,
  sort     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid          NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  category_id  uuid          REFERENCES menu_categories (id) ON DELETE SET NULL,
  name         text          NOT NULL,
  description  text          NOT NULL DEFAULT '',
  price        integer       NOT NULL CHECK (price >= 0),
  image        text,
  is_available boolean       NOT NULL DEFAULT true,
  rating       numeric(2, 1) NOT NULL DEFAULT 4.5 CHECK (rating >= 0 AND rating <= 5)
);

CREATE TABLE IF NOT EXISTS item_options (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id  uuid    NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
  name     text    NOT NULL,
  required boolean NOT NULL DEFAULT false,
  multi    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS option_choices (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   uuid    NOT NULL REFERENCES item_options (id) ON DELETE CASCADE,
  name        text    NOT NULL,
  price_delta integer NOT NULL DEFAULT 0
);

-- Promotions ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  code         text    PRIMARY KEY,
  kind         text    NOT NULL CHECK (kind IN ('percent', 'flat', 'freeship')),
  value        integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  max_discount integer CHECK (max_discount IS NULL OR max_discount >= 0),
  min_order    integer NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  active       boolean NOT NULL DEFAULT true
);

-- Orders -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id       uuid             NOT NULL REFERENCES users (id),
  store_id       uuid             NOT NULL REFERENCES stores (id),
  status         text             NOT NULL DEFAULT 'placed'
                   CHECK (status IN ('placed', 'store_accepted', 'preparing', 'ready',
                                     'rider_assigned', 'picked_up', 'delivering',
                                     'delivered', 'cancelled')),
  subtotal       integer          NOT NULL CHECK (subtotal >= 0),
  delivery_fee   integer          NOT NULL DEFAULT 39 CHECK (delivery_fee >= 0),
  service_fee    integer          NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  discount       integer          NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total          integer          NOT NULL CHECK (total >= 0),
  promo_code     text             REFERENCES promotions (code) ON DELETE SET NULL,
  payment_method text,
  payment_status text             NOT NULL DEFAULT 'pending'
                   CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  pickup_pin     text,
  eta_min        integer          CHECK (eta_min IS NULL OR eta_min >= 0),
  buyer_lat      double precision,
  buyer_lng      double precision,
  timeline       jsonb            NOT NULL DEFAULT '[]',
  created_at     timestamptz      NOT NULL DEFAULT now(),
  updated_at     timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid    NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  item_id    uuid    REFERENCES menu_items (id),
  name       text    NOT NULL,
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  qty        integer NOT NULL CHECK (qty > 0),
  options    jsonb   NOT NULL DEFAULT '[]',
  line_total integer NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  method     text        NOT NULL,
  amount     integer     NOT NULL CHECK (amount >= 0),
  status     text        NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  ref_code   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dispatch & tracking ------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  rider_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'offered'
               CHECK (status IN ('offered', 'accepted', 'declined', 'expired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_tracking (
  id         bigserial              PRIMARY KEY,
  order_id   uuid                   NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  rider_id   uuid                   REFERENCES users (id) ON DELETE SET NULL,
  geom       geography(Point, 4326) NOT NULL,
  heading    real,
  speed      real,
  at         timestamptz            NOT NULL DEFAULT now()
);

-- Reviews & support --------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES users (id),
  store_id   uuid        REFERENCES stores (id) ON DELETE SET NULL,
  rider_id   uuid        REFERENCES users (id) ON DELETE SET NULL,
  rating     integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        REFERENCES orders (id) ON DELETE SET NULL,
  opener_id  uuid        NOT NULL REFERENCES users (id),
  subject    text        NOT NULL,
  priority   text        NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
  status     text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  sender_role text        NOT NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rider_profiles_last_location ON rider_profiles USING GIST (last_location);
CREATE INDEX IF NOT EXISTS idx_stores_location ON stores USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_tracking_geom ON delivery_tracking USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_offers_order_status ON offers (order_id, status);
CREATE INDEX IF NOT EXISTS idx_tracking_order_at ON delivery_tracking (order_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_menu_items_store ON menu_items (store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews (order_id);
-- #8: one review per target per order (store XOR rider). Backstop for the
-- 409 guard in POST /api/orders/:id/review.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order_store
  ON reviews (order_id) WHERE store_id IS NOT NULL AND rider_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order_rider
  ON reviews (order_id) WHERE rider_id IS NOT NULL AND store_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages (ticket_id);
