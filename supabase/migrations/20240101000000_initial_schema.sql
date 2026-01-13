CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Environment files table
CREATE TABLE public.env_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, file_name)
);

-- Version history table
CREATE TABLE public.env_file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_file_id UUID NOT NULL REFERENCES public.env_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_env_files_project_id ON public.env_files(project_id);
CREATE INDEX idx_env_file_versions_env_file_id ON public.env_file_versions(env_file_id);
CREATE INDEX idx_env_file_versions_created_at ON public.env_file_versions(created_at DESC);

-- Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.env_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.env_file_versions ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Env files policies
CREATE POLICY "Users can view own env files"
  ON public.env_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = env_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own env files"
  ON public.env_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = env_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own env files"
  ON public.env_files FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = env_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own env files"
  ON public.env_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = env_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Version history policies
CREATE POLICY "Users can view own version history"
  ON public.env_file_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.env_files
      JOIN public.projects ON projects.id = env_files.project_id
      WHERE env_files.id = env_file_versions.env_file_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create version history"
  ON public.env_file_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.env_files
      JOIN public.projects ON projects.id = env_files.project_id
      WHERE env_files.id = env_file_versions.env_file_id
      AND projects.user_id = auth.uid()
    )
  );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_env_files_updated_at
  BEFORE UPDATE ON public.env_files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to auto-create version on update
CREATE OR REPLACE FUNCTION public.create_env_file_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.env_file_versions (env_file_id, content, hash)
    VALUES (OLD.id, OLD.content, OLD.hash);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_version_on_update
  BEFORE UPDATE ON public.env_files
  FOR EACH ROW
  EXECUTE FUNCTION public.create_env_file_version();
