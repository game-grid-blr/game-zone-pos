import type { PaymentMethod, PaymentStatus, Role, SessionStatus, TableStatus } from "@prisma/client";
import type { AppSettings } from "@/lib/settings";

export type UserSummary = {
  id: string;
  name: string;
  username: string;
  role: Role;
};

export type PricingDTO = {
  id: string;
  gameTableId: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};

export type GameTableDTO = {
  id: string;
  name: string;
  gameType: string;
  status: TableStatus;
  active: boolean;
  sortOrder: number;
  pricing: PricingDTO[];
  sessions?: SessionDTO[];
};

export type SessionExtensionDTO = {
  id: string;
  sessionId: string;
  durationMinutes: number;
  amount: number;
  taxAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
};

export type PaymentDTO = {
  id: string;
  sessionId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionReference?: string | null;
  createdAt: string;
};

export type SessionDTO = {
  id: string;
  sessionNumber: string;
  gameTableId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  startedAt: string;
  endsAt: string;
  pausedAt?: string | null;
  remainingSecondsAtPause?: number | null;
  originalDurationMinutes: number;
  status: SessionStatus;
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  finalAmount: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  refundAmount: number;
  refundReason?: string | null;
  refundedAt?: string | null;
  gameTable: Omit<GameTableDTO, "sessions" | "pricing">;
  extensions: SessionExtensionDTO[];
  payments: PaymentDTO[];
};

export type DashboardStatsDTO = {
  revenue: number;
  sessions: number;
  playingHours: number;
  activeSessions: number;
  cashCollected: number;
  upiCollected: number;
  cardCollected: number;
  revenueByGame: Record<string, number>;
  revenueByTable: Record<string, number>;
};

export type DashboardData = {
  settings: AppSettings;
  generatedAt: string;
  tables: GameTableDTO[];
  stats: DashboardStatsDTO;
};
