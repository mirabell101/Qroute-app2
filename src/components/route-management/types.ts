import { TABS } from "./constants";
import type {
  AdminRouteRecord,
  AdminRouteArchiveRecoveryStatus,
  AdminTransitPointRecord,
  AdminTransportTypeRecord,
  RouteManagementEntityType,
} from "@/lib/adminApi";

export type ManagementTab = (typeof TABS)[number];

export type ManagementEntity =
  | RouteManagementEntityType
  | "transport_type";

export type RecordData =
  | AdminRouteRecord
  | AdminTransitPointRecord
  | AdminTransportTypeRecord;

export interface ManagementRow {
  key: string;
  entityType: ManagementEntity;
  id: number;
  name: string;
  transportTypeId: number | null;
  transportTypeName: string;
  status: string;
  moderationStatus:
    | "pending"
    | "approved"
    | "rejected"
    | null;
  isActive: boolean;
  isBanned: boolean;
  isDeleted: boolean;
  archiveRecovery: AdminRouteArchiveRecoveryStatus | null;
  record: RecordData;
}

export interface EditableRouteStop {
  kind: "terminal" | "stop";
  id: number;
  name: string;
  kindLabel: string;
  unresolved: boolean;
}

export interface EditorState {
  entityType: ManagementEntity;
  id: number | null;
  name: string;
  color: string;
  transportTypeId: number | null;
  variantId: number | null;
  isActive: boolean;
  latitude: string;
  longitude: string;
  description: string;
  stopType: "road_stop" | "train_station";
  stops: EditableRouteStop[];
}

