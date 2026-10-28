export type Role = 'LEARNER' | 'TEACHER' | 'ADMIN';
export type WorksheetStatus = 'DRAFT' | 'APPROVED';
export type QuestionKind = 'short_answer' | 'fill_blank' | 'mcq' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface User {
  id: number;
  display_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Subject {
  id: number;
  slug: string;
  name: string;
  class_level: number;
}

export interface LessonSummary {
  id: number;
  slug: string;
  title: string;
  topic: string;
  summary: string;
  class_level: number;
  subject: string;
  estimated_minutes: number;
}

export interface LessonSection {
  id: number;
  heading: string;
  passage: string;
  position: number;
}

export interface LessonDetail extends LessonSummary {
  sections: LessonSection[];
  quiz_id: number | null;
  attribution: string | null;
  license: string | null;
}

export interface Question {
  id: number;
  prompt: string;
  choices: string[];
  topic: string;
  position: number;
}

export interface Quiz {
  id: number;
  title: string;
  lesson_id: number;
  questions: Question[];
}

export interface ReviewItem {
  question_id: number;
  prompt: string;
  selected: string;
  correct: boolean;
  answer: string;
  explanation: string;
  topic: string;
}

export interface SubmitResult {
  attempt_id: number;
  score: number;
  total: number;
  percent: number;
  mastery: number;
  recommendation: string;
  review: ReviewItem[];
}

export interface Attempt {
  id: number;
  quiz_id: number;
  quiz_title: string;
  lesson_id: number;
  lesson_title: string;
  score: number;
  total: number;
  percent: number;
  created_at: string;
}

export interface AttemptDetail extends Attempt {
  review: ReviewItem[];
}

export interface ProgressRow {
  lesson_id: number;
  lesson_slug: string;
  title: string;
  topic: string;
  subject: string;
  mastery: number;
  attempts: number;
  last_attempt_at: string | null;
  recommendation: string;
}

export interface TutorSource {
  lesson_id: number;
  section_id: number;
  heading: string;
}

export interface TutorAnswer {
  session_id: number;
  answer: string;
  sources: TutorSource[];
  insufficient_evidence: boolean;
  ai_used: boolean;
}

export interface TutorSessionSummary {
  id: number;
  lesson_id: number;
  lesson_title: string;
  created_at: string;
  message_count: number;
}

export interface TutorMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export interface TutorSessionDetail {
  id: number;
  lesson_id: number;
  lesson_title: string;
  created_at: string;
  messages: TutorMessage[];
}

export interface SkillLesson {
  id: number;
  slug: string;
  title: string;
  body: string;
  position: number;
  completed: boolean;
}

export interface SkillCourseSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  lesson_count: number;
  completed_count: number;
}

export interface SkillCourseDetail extends SkillCourseSummary {
  lessons: SkillLesson[];
}

export interface SkillCourseProgress {
  id: number;
  title: string;
  completed: number;
  total: number;
  lessons: SkillLesson[];
}

export interface SkillProgress {
  skill_lesson_id: number;
  completed: boolean;
  updated_at: string | null;
}

export interface ClassSummary {
  id: number;
  name: string;
  class_level: number;
  join_code: string | null;
  learner_count: number;
  created_at: string;
}

export interface ClassMember {
  learner_id: number;
  display_name: string;
  email: string;
  joined_at: string;
  attempts: number;
  mean_score: number | null;
}

export interface ClassDetail extends ClassSummary {
  members: ClassMember[];
}

export interface LearnerClass {
  id: number;
  name: string;
  class_level: number;
  teacher_name: string;
  joined_at: string;
}

export interface LearnerPerformance {
  learner_id: number;
  display_name: string;
  attempts: number;
  mean_score: number | null;
  latest_score: number | null;
  last_attempt_at: string | null;
}

export interface ClassPerformance {
  class_id: number;
  class_name: string;
  learner_count: number;
  learners_with_attempts: number;
  attempts: number;
  mean_score: number | null;
  mean_latest_score: number | null;
  learners: LearnerPerformance[];
}

export interface GapRow {
  question_id: number;
  prompt: string;
  topic: string;
  lesson_title: string;
  misses: number;
  affected_learners: number;
}

export interface LearningGaps {
  class_id: number;
  class_name: string;
  most_missed_questions: GapRow[];
}

export interface TeacherDashboard {
  classes: ClassSummary[];
  learners: number;
  attempts: number;
  mean_latest_score: number | null;
  draft_worksheets: number;
}

export interface WorksheetQuestion {
  kind: QuestionKind;
  prompt: string;
  choices: string[] | null;
  answer_key: string;
  explanation: string;
  source_section: string;
}

export interface WorksheetContent {
  title: string;
  instructions: string;
  questions: WorksheetQuestion[];
}

export interface WorksheetSummary {
  id: number;
  title: string;
  subject: string;
  topic: string;
  class_level: number;
  difficulty: string;
  status: WorksheetStatus;
  question_count: number;
  generated_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorksheetSource {
  lesson_id: number;
  lesson_title: string;
  attribution: string | null;
  license: string | null;
  sections: string[];
}

export interface Worksheet extends WorksheetSummary {
  teacher_id: number;
  content: WorksheetContent;
  sources: WorksheetSource[];
  model_name: string | null;
}

export interface AdminStats {
  users: number;
  learners: number;
  teachers: number;
  admins: number;
  active_users_7d: number;
  classes: number;
  lessons: number;
  attempts: number;
  worksheets: number;
}

export type AdminUser = User;

export interface AuditEvent {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface PaginatedUsers {
  total: number;
  users: AdminUser[];
}
