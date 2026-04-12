type ImageChoiceLike = {
  imageId?: string;
  imagePath?: string;
};

const LISTENING_IMAGE_PATHS: Record<string, string> = {
  traffic_clear: "/generated/listening-cards/unit-16/clear-road.svg",
  traffic_jam: "/generated/listening-cards/unit-16/traffic-jam.svg",
  bus_hotel_15: "/generated/listening-cards/unit-16/bus-hotel-15.svg",
  walk_hotel_15: "/generated/listening-cards/unit-16/walk-hotel-15.svg",
};

export function resolveListeningChoiceImagePath(choice: ImageChoiceLike) {
  if (choice.imagePath) {
    return choice.imagePath;
  }

  if (!choice.imageId) {
    return undefined;
  }

  return LISTENING_IMAGE_PATHS[choice.imageId];
}
