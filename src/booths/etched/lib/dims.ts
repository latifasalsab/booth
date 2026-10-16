/** Shared dimensions: the height-map canvas (HW x HH) and the analysis / working size (WORK_W x WORK_H). */
export const HW = 448;
export const HH = 560;
/** Analysis (working) size. Stroke widths are specified in working pixels and scaled to the height canvas. */
export const WORK_W = 768;
export const WORK_H = 960;
export const WIDTH_SCALE = HW / WORK_W;
