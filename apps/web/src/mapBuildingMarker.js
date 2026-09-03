export const DEFAULT_MAP_BUILDING_IMAGE = '/map-building-default.svg';

export function getProjectMapImage(project) {
  const uploaded = typeof project?.mapMarkerImage === 'string' ? project.mapMarkerImage.trim() : '';
  return uploaded || DEFAULT_MAP_BUILDING_IMAGE;
}
