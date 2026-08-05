export const PROVIDERS = ["openai", "claude"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const FEEDBACK_CATEGORIES = [
  "sounds_like_me",
  "does_not_sound_like_me",
  "good_idea_wrong_wording",
  "would_not_reply",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const SELECTION_SOURCES = ["openai", "claude", "manual", "neither"] as const;
export type SelectionSource = (typeof SELECTION_SOURCES)[number];

export interface ProviderSettings {
  useOpenAI: boolean;
  useClaude: boolean;
  voiceUpdateProvider: Provider;
  calibrationComplete: boolean;
  approvedRevisionId: number | null;
  updatedAt: string;
}

export interface CredentialStatus {
  openai: boolean;
  claude: boolean;
  fixtures: boolean;
}

export interface EngagementMetrics {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  impressions?: number;
  bookmarks?: number;
}

export interface PostMedia {
  type: "photo" | "video" | "animated_gif";
  url?: string;
  previewUrl?: string;
  altText?: string;
}

export type TopicCategory = "software_engineering" | "ai_ml";

export interface CandidatePost {
  id: string;
  authorName: string;
  username: string;
  text: string;
  createdAt: string;
  metrics: EngagementMetrics;
  url: string;
  media: PostMedia[];
  category: TopicCategory;
  score: number;
}

export type CapturedForYouPost = Omit<CandidatePost, "category" | "score">;

export interface ForYouImportStatus {
  importId: number | null;
  capturedAt: string | null;
  postCount: number;
}

export interface Draft {
  id: number;
  provider: Provider;
  content: string;
  createdAt: string;
}

export interface ReviewInput {
  postId: string;
  selectedSource: SelectionSource;
  selectedReply: string;
  editedReply: string;
  replacementReply: string;
  feedbackCategory: FeedbackCategory;
  writtenFeedback: string;
  wouldReply: boolean;
}

export interface SavedReview extends ReviewInput {
  id: number;
  reviewedAt: string;
}

export interface BatchPost extends CandidatePost {
  drafts: Partial<Record<Provider, Draft>>;
  review: SavedReview | null;
}

export interface Batch {
  id: number;
  createdAt: string;
  completedAt: string | null;
  status: "generating" | "ready" | "reviewed" | "failed";
  providers: Provider[];
  source: "for_you" | "fixtures" | "x_api";
  voiceVersion: string;
  posts: BatchPost[];
}

export interface VoiceRevision {
  id: number;
  filename: string;
  content: string;
  summary: string;
  approved: boolean;
  createdAt: string;
}

export interface ComparisonStats {
  batchId: number | null;
  reviewed: number;
  total: number;
  openai: ProviderStats | null;
  claude: ProviderStats | null;
  neitherSelected: number;
  manualReplacements: number;
}

export interface ProviderStats {
  selected: number;
  soundsLikeMeRate: number;
  rejectionRate: number;
  averageEditPercent: number;
}

export interface RelevantExample {
  sourcePost: string;
  acceptedReply: string;
  feedbackCategory: FeedbackCategory;
  writtenFeedback: string;
  score: number;
}
