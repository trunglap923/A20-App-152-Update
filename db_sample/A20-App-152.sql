-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_banners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement text NOT NULL CHECK (placement = ANY (ARRAY['Top bar'::text, 'Cạnh bên'::text, 'Popup giữa màn hình'::text])),
  type text NOT NULL CHECK (type = ANY (ARRAY['Info'::text, 'Warning'::text, 'Khuyến mãi'::text])),
  content text NOT NULL,
  cta_text text NOT NULL,
  cta_link text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  ctr numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_banners_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_broadcast_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  audience text NOT NULL CHECK (audience = ANY (ARRAY['Tất cả user'::text, 'User đang hoạt động'::text, 'User trả phí (Pro/Enterprise)'::text, 'User sắp hết hạn gói'::text])),
  channel text NOT NULL CHECK (channel = ANY (ARRAY['Email'::text, 'In-app Notification'::text, 'Push Notification'::text])),
  status text NOT NULL DEFAULT 'Đang gửi'::text CHECK (status = ANY (ARRAY['Đang gửi'::text, 'Đã gửi'::text, 'Lỗi'::text])),
  open_rate numeric NOT NULL DEFAULT 0,
  scheduled_at timestamp with time zone,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_broadcast_campaigns_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_logs (
  id uuid NOT NULL,
  created_at timestamp without time zone NOT NULL,
  user_id uuid,
  user_email character varying,
  task_type character varying NOT NULL,
  model_name character varying NOT NULL,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  success boolean,
  error_message text,
  prompt text,
  response text,
  item_id uuid,
  CONSTRAINT ai_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.auth_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  email text,
  event text NOT NULL CHECK (event = ANY (ARRAY['login'::text, 'register'::text, 'logout'::text, 'password_reset'::text])),
  success boolean NOT NULL,
  ip inet,
  user_agent text,
  device text,
  os text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT auth_audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_messages (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  item_id uuid,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.embeddings (
  id uuid NOT NULL,
  chunk_id uuid NOT NULL UNIQUE,
  embedding USER-DEFINED,
  model text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT embeddings_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.item_chunks(id)
);
CREATE TABLE public.enrichment_jobs (
  id uuid NOT NULL,
  item_id uuid NOT NULL,
  job_type text NOT NULL,
  status text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])),
  error text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT enrichment_jobs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id)
);
CREATE TABLE public.item_chunks (
  id uuid NOT NULL,
  item_id uuid NOT NULL,
  content text NOT NULL,
  chunk_index integer,
  start_time double precision,
  end_time double precision,
  frame_urls ARRAY DEFAULT '{}'::text[],
  chunk_metadata jsonb DEFAULT '{}'::jsonb,
  token_count integer,
  created_at timestamp with time zone DEFAULT now(),
  search_vector tsvector,
  CONSTRAINT item_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT item_chunks_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id)
);
CREATE TABLE public.item_tags (
  item_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  CONSTRAINT item_tags_pkey PRIMARY KEY (item_id, tag_id),
  CONSTRAINT item_tags_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id),
  CONSTRAINT item_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id)
);
CREATE TABLE public.items (
  id character varying NOT NULL,
  title character varying NOT NULL,
  source_type character varying,
  source_url character varying,
  content text,
  status character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.knowledge_items (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  source_type text CHECK (source_type = ANY (ARRAY['pdf'::text, 'youtube'::text, 'audio'::text, 'video'::text])),
  source_url text,
  thumbnail_url text,
  metadata jsonb,
  raw_content text,
  language text,
  duration integer,
  status text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])),
  processing_stage text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT knowledge_items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.lesson_progress (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  status text CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'done'::text])),
  score double precision,
  started_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lesson_progress_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.lessons (
  id uuid NOT NULL,
  item_id uuid NOT NULL,
  title text,
  content text,
  example text,
  order_index integer,
  created_at timestamp with time zone DEFAULT now(),
  start_time integer,
  end_time integer,
  metadata_json text,
  CONSTRAINT lessons_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id)
);
CREATE TABLE public.llm_cache (
  id uuid NOT NULL,
  prompt_hash text UNIQUE,
  response text,
  model text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT llm_cache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mindmaps (
  id uuid NOT NULL,
  item_id uuid NOT NULL,
  data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mindmaps_pkey PRIMARY KEY (id),
  CONSTRAINT mindmaps_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id)
);
CREATE TABLE public.notes (
  id character varying NOT NULL,
  item_id character varying NOT NULL,
  note_type character varying NOT NULL,
  content text,
  data json,
  CONSTRAINT notes_pkey PRIMARY KEY (id),
  CONSTRAINT notes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.payment_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['vietqr'::text, 'momo'::text, 'zalopay'::text])),
  billing_cycle text NOT NULL CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  order_code text NOT NULL UNIQUE,
  provider_order_id text UNIQUE,
  provider_transaction_id text UNIQUE,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'VND'::text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])),
  payment_url text,
  qr_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT payment_transactions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id)
);
CREATE TABLE public.payment_webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = ANY (ARRAY['vietqr'::text, 'momo'::text, 'zalopay'::text])),
  transaction_id uuid,
  payload jsonb NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'received'::text CHECK (status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text])),
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhooks_pkey PRIMARY KEY (id),
  CONSTRAINT payment_webhooks_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id)
);
CREATE TABLE public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly integer NOT NULL DEFAULT 0,
  price_yearly integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  credits_monthly integer NOT NULL DEFAULT 0,
  credits_yearly integer NOT NULL DEFAULT 0,
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quiz_answers (
  id uuid NOT NULL,
  question_id uuid NOT NULL,
  content text NOT NULL,
  is_correct boolean,
  order_index integer,
  CONSTRAINT quiz_answers_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id)
);
CREATE TABLE public.quiz_attempts (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  score double precision,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.quiz_questions (
  id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  question text NOT NULL,
  question_type text CHECK (question_type = ANY (ARRAY['single_choice'::text, 'multiple_choice'::text, 'true_false'::text])),
  explanation text,
  order_index integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quiz_questions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.quizzes (
  id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  title text,
  description text,
  total_questions integer,
  difficulty text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quizzes_pkey PRIMARY KEY (id),
  CONSTRAINT quizzes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'pending'::text])),
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  auto_renew boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_transaction_id uuid,
  cancelled_at timestamp with time zone,
  expired_at timestamp with time zone,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id)
);
CREATE TABLE public.summaries (
  id uuid NOT NULL,
  item_id uuid NOT NULL,
  content text,
  tldr jsonb DEFAULT '[]'::jsonb,
  highlights jsonb DEFAULT '[]'::jsonb,
  model text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT summaries_pkey PRIMARY KEY (id),
  CONSTRAINT summaries_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id)
);
CREATE TABLE public.tags (
  id uuid NOT NULL,
  name text UNIQUE,
  CONSTRAINT tags_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_answers (
  id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer_id uuid,
  is_correct boolean,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_answers_pkey PRIMARY KEY (id),
  CONSTRAINT user_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.quiz_attempts(id),
  CONSTRAINT user_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id),
  CONSTRAINT user_answers_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.quiz_answers(id)
);
CREATE TABLE public.user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['Email'::text, 'In-app Notification'::text, 'Push Notification'::text])),
  campaign_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  role text DEFAULT 'student'::text CHECK (role = ANY (ARRAY['student'::text, 'instructor'::text, 'admin'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  phone_number text,
  birth_date date,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  theme text DEFAULT 'light'::text CHECK (theme = ANY (ARRAY['light'::text, 'dark'::text])),
  notifications_enabled boolean DEFAULT true,
  language text DEFAULT 'vi'::text,
  receive_course_updates boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);