/** MediaPipe face mesh landmark index sets used by the stroke pipeline (rings are listed in drawing order). */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
/** "Left"/"right" follow MediaPipe (the subject's side): LEFT_* sit on the right of the image. */
export const LEFT_EYE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];
export const RIGHT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const LEFT_EYEBROW = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300];
export const RIGHT_EYEBROW = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70];
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4];
export const NOSE_BASE = [98, 97, 2, 326, 327];
/** [iris center, four iris edge points] */
export const IRISES: [number, number[]][] = [[468, [469, 470, 471, 472]], [473, [474, 475, 476, 477]]];
export const CHIN = 152;
export const EAR_RIGHT_SIDE_OF_IMAGE = 454;
export const EAR_LEFT_SIDE_OF_IMAGE = 234;
