-- ==========================================
-- SCRIPT SỬA LỖI BẢO MẬT RLS (SUPABASE)
-- ==========================================

-- 1. Bật RLS cho tất cả các bảng
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mindmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- 2. Xóa các policy cũ (nếu có) để tránh xung đột
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 3. Tạo chính sách (Policies)

-- [Knowledge Items] - Người dùng chỉ thấy/sửa đồ của mình
CREATE POLICY "Users can manage their own knowledge items" 
ON public.knowledge_items FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- [Item Chunks] - Dựa trên knowledge_items
CREATE POLICY "Users can manage chunks of their own items" 
ON public.item_chunks FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));

-- [Embeddings] - Dựa trên item_chunks -> knowledge_items
CREATE POLICY "Users can manage embeddings of their own items" 
ON public.embeddings FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.item_chunks c 
    JOIN public.knowledge_items k ON c.item_id = k.id 
    WHERE c.id = chunk_id AND k.user_id = auth.uid()
));

-- [Enrichment Jobs] - Dựa trên knowledge_items
CREATE POLICY "Users can manage jobs of their own items" 
ON public.enrichment_jobs FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));

-- [Summaries] - Dựa trên knowledge_items
CREATE POLICY "Users can manage summaries of their own items" 
ON public.summaries FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));

-- [Mindmaps] - Dựa trên knowledge_items
CREATE POLICY "Users can manage mindmaps of their own items" 
ON public.mindmaps FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));

-- [Lessons] - Dựa trên knowledge_items
CREATE POLICY "Users can manage lessons of their own items" 
ON public.lessons FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));

-- [Quizzes] - Dựa trên lessons -> knowledge_items
CREATE POLICY "Users can manage quizzes of their own items" 
ON public.quizzes FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.lessons l 
    JOIN public.knowledge_items k ON l.item_id = k.id 
    WHERE l.id = lesson_id AND k.user_id = auth.uid()
));

-- [Quiz Questions] - Dựa trên quizzes -> ...
CREATE POLICY "Users can manage quiz questions" 
ON public.quiz_questions FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.quizzes q
    JOIN public.lessons l ON q.lesson_id = l.id
    JOIN public.knowledge_items k ON l.item_id = k.id
    WHERE q.id = quiz_id AND k.user_id = auth.uid()
));

-- [Quiz Answers] - Dựa trên quiz_questions -> ...
CREATE POLICY "Users can manage quiz answers" 
ON public.quiz_answers FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON qq.quiz_id = q.id
    JOIN public.lessons l ON q.lesson_id = l.id
    JOIN public.knowledge_items k ON l.item_id = k.id
    WHERE qq.id = question_id AND k.user_id = auth.uid()
));

-- [Quiz Attempts] - Người dùng chỉ thấy/sửa đồ của mình
CREATE POLICY "Users can manage their own quiz attempts" 
ON public.quiz_attempts FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- [User Answers] - Dựa trên quiz_attempts
CREATE POLICY "Users can manage their own answers" 
ON public.user_answers FOR ALL 
USING (EXISTS (SELECT 1 FROM public.quiz_attempts WHERE id = attempt_id AND user_id = auth.uid()));

-- [Lesson Progress] - Người dùng chỉ thấy/sửa đồ của mình
CREATE POLICY "Users can manage their own progress" 
ON public.lesson_progress FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- [Tags] - Cho phép đọc công khai, nhưng chỉ admin hoặc auth user mới được thêm (tạm thời cho auth user)
CREATE POLICY "Public read tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create tags" ON public.tags FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- [Item Tags] - Dựa trên knowledge_items
CREATE POLICY "Users can manage tags of their own items" 
ON public.item_tags FOR ALL 
USING (EXISTS (SELECT 1 FROM public.knowledge_items WHERE id = item_id AND user_id = auth.uid()));
