export type LngLat = [number, number];

export type Profile = "walking" | "cycling" | "driving";

export type Activity = "walk" | "run" | "bike";

export type Mode = "waypoint" | "freehand";

export type Units = "km" | "mi";

export type StyleKey = "light" | "dark";

export type Segment = {
  id: string;
  mode: Mode;
  profile: Profile;
  rawCoords: LngLat[];
  snappedCoords: LngLat[];
  distanceM: number;
};

export const ACTIVITY_TO_PROFILE: Record<Activity, Profile> = {
  walk: "walking",
  run: "walking",
  bike: "cycling",
};
