CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- 1. TABLES
-- ==========================================

-- Bảng 1: knowledge_items
CREATE TABLE public.knowledge_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  title text NOT NULL CHECK (length(TRIM(BOTH FROM title)) > 0),
  description text,

  -- Hỗ trợ đa phương tiện
  source_type text CHECK (source_type = ANY (ARRAY['pdf','youtube','audio','video'])),
  source_url text,
  thumbnail_url text,
  metadata jsonb,

  raw_content text,
  language text DEFAULT 'en',
  duration integer,

  status text DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','running','done','failed'])),
  processing_stage text, 

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT knowledge_items_pkey PRIMARY KEY (id)
  -- CONSTRAINT knowledge_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Bảng 2: item_chunks
CREATE TABLE public.item_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,

  content text NOT NULL,
  chunk_index integer,

  start_time double precision,
  end_time double precision,
  
  -- Hỗ trợ Multimodal RAG (Lưu mảng URL các frame ảnh được cắt ra từ video)
  frame_urls text[] DEFAULT '{}',
  chunk_metadata jsonb DEFAULT '{}',

  token_count integer,

  created_at timestamp with time zone DEFAULT now(),
  search_vector tsvector,

  CONSTRAINT item_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT item_chunks_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE
);

-- Bảng 3: embeddings
CREATE TABLE public.embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL,

  embedding vector(1536),
  model text,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT embeddings_chunk_id_fkey FOREIGN KEY (chunk_id)
    REFERENCES public.item_chunks(id) ON DELETE CASCADE,
    
  CONSTRAINT unique_chunk_embedding UNIQUE (chunk_id)
);

-- Bảng 4: enrichment_jobs
CREATE TABLE public.enrichment_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,

  job_type text NOT NULL,
  status text DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','running','done','failed'])),

  error text,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT enrichment_jobs_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE
);

-- Bảng 5: summaries
CREATE TABLE public.summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,

  content text,
  tldr jsonb,
  highlights jsonb,
  model text,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT summaries_pkey PRIMARY KEY (id),
  CONSTRAINT summaries_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE
);

-- Bảng 6: mindmaps
CREATE TABLE public.mindmaps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,

  data jsonb,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT mindmaps_pkey PRIMARY KEY (id),
  CONSTRAINT mindmaps_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE
);

-- Bảng 7: tags
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text UNIQUE,

  CONSTRAINT tags_pkey PRIMARY KEY (id)
);

-- Bảng 8: item_tags
CREATE TABLE public.item_tags (
  item_id uuid NOT NULL,
  tag_id uuid NOT NULL,

  CONSTRAINT item_tags_pkey PRIMARY KEY (item_id, tag_id),
  CONSTRAINT item_tags_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE,
  CONSTRAINT item_tags_tag_id_fkey FOREIGN KEY (tag_id)
    REFERENCES public.tags(id) ON DELETE CASCADE
);

-- Bảng 9: lessons
CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,

  title text,
  content text,
  example text,
  order_index integer,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT lessons_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.knowledge_items(id) ON DELETE CASCADE
);

-- Bảng 10: quizzes
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,

  title text,
  description text,
  total_questions integer,
  difficulty text,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT quizzes_lesson_id_fkey FOREIGN KEY (lesson_id)
    REFERENCES public.lessons(id) ON DELETE CASCADE
);

-- Bảng 11: quiz_questions
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL,

  question text NOT NULL,
  question_type text DEFAULT 'single_choice'
    CHECK (question_type = ANY (ARRAY[
    'single_choice', 
    'multiple_choice', 
    'true_false'       
    ])),

  explanation text,
  order_index integer,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id)
    REFERENCES public.quizzes(id) ON DELETE CASCADE,
    
  CONSTRAINT unique_quiz_question_order UNIQUE (quiz_id, order_index)
);

-- Bảng 12: quiz_answers
CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,

  content text NOT NULL,
  is_correct boolean DEFAULT false,
  order_index integer,

  CONSTRAINT quiz_answers_question_id_fkey FOREIGN KEY (question_id)
    REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    
  CONSTRAINT unique_question_answer_order UNIQUE (question_id, order_index)
);

-- Bảng 13: quiz_attempts
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,

  score double precision,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,

  -- CONSTRAINT quiz_attempts_user_id_fkey FOREIGN KEY (user_id)
  --   REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id)
    REFERENCES public.quizzes(id) ON DELETE CASCADE
);

-- Bảng 14: user_answers
CREATE TABLE public.user_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer_id uuid,

  is_correct boolean,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT user_answers_attempt_id_fkey FOREIGN KEY (attempt_id)
    REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  CONSTRAINT user_answers_question_id_fkey FOREIGN KEY (question_id)
    REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  CONSTRAINT user_answers_answer_id_fkey FOREIGN KEY (answer_id)
    REFERENCES public.quiz_answers(id) ON DELETE CASCADE,

  CONSTRAINT unique_attempt_question UNIQUE (attempt_id, question_id)
);

-- Bảng 15: lesson_progress
CREATE TABLE public.lesson_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,

  status text DEFAULT 'not_started'
    CHECK (status = ANY (ARRAY['not_started','in_progress','done'])),

  score double precision,
  started_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT lesson_progress_pkey PRIMARY KEY (id),
  -- CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id)
  --   REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id)
    REFERENCES public.lessons(id) ON DELETE CASCADE,

  CONSTRAINT unique_user_lesson UNIQUE (user_id, lesson_id)
);

-- Bảng 16: llm_cache
CREATE TABLE public.llm_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prompt_hash text UNIQUE,
  response text,
  model text,
  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT llm_cache_pkey PRIMARY KEY (id)
);

-- ==========================================
-- 2. INDEXES (Tối ưu hóa Query & Foreign Keys)
-- ==========================================

CREATE INDEX idx_embeddings_vector ON public.embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_fts ON public.item_chunks USING GIN(search_vector);

CREATE INDEX idx_knowledge_items_user ON public.knowledge_items(user_id);
CREATE INDEX idx_chunks_item ON public.item_chunks(item_id);
CREATE INDEX idx_jobs_item ON public.enrichment_jobs(item_id);
CREATE INDEX idx_lessons_item ON public.lessons(item_id);
CREATE INDEX idx_quizzes_lesson ON public.quizzes(lesson_id);
CREATE INDEX idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX idx_quiz_answers_question ON public.quiz_answers(question_id);
CREATE INDEX idx_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX idx_attempts_quiz ON public.quiz_attempts(quiz_id);
CREATE INDEX idx_user_answers_attempt ON public.user_answers(attempt_id);
CREATE INDEX idx_user_answers_question ON public.user_answers(question_id);
CREATE INDEX idx_lesson_progress_user ON public.lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON public.lesson_progress(lesson_id);

CREATE UNIQUE INDEX unique_active_attempt ON public.quiz_attempts (user_id, quiz_id) WHERE completed_at IS NULL;

-- ==========================================
-- 3. FUNCTIONS & TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_items_updated_at
BEFORE UPDATE ON public.knowledge_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_enrichment_jobs_updated_at
BEFORE UPDATE ON public.enrichment_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lesson_progress_updated_at
BEFORE UPDATE ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_search_vector
BEFORE INSERT OR UPDATE ON public.item_chunks
FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) - BẢO MẬT SUPABASE
-- ==========================================

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;