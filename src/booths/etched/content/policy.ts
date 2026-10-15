/**
 * Policy page copy for Etched Booth (English).
 * KEEP THESE STATEMENTS IN SYNC WITH THE IMPLEMENTATION. For example, if a face-landmark model is downloaded at
 * runtime, analytics are added, or anything new is stored or sent anywhere, update the text below and LAST_UPDATED.
 */
export const LAST_UPDATED = "13 October 2026";

export const POLICY_LABEL = "FINE PRINT";
export const POLICY_TITLE = "Your face stays with you.";

export type PolicyIcon = "device" | "camera" | "lock";

export const POLICY_POINTS: { icon: PolicyIcon; text: string }[] = [
  { icon: "device", text: "Processed on your device." },
  { icon: "camera", text: "Camera only when you press Start." },
  { icon: "lock", text: "No accounts. No tracking." },
];

export const POLICY_SECTIONS = [
  {
    id: "camera",
    heading: "Camera",
    body: "The camera starts only after you press Start camera and allow access. It stops as soon as the photo is taken. A small face-detection model runs in your browser. Its file is fetched once from a public server and cached; no photo or camera data is sent anywhere.",
  },
  {
    id: "photos",
    heading: "Photos",
    body: "Your photo is processed in your browser's memory. It is never uploaded and disappears when you press Again or close the tab. Anything you save is a file you download yourself.",
  },
  {
    id: "storage",
    heading: "What we store",
    // The sound on/off choice is also kept in local storage (see hooks/SoundContext.tsx), so it is named here.
    body: "Only a small counter (plates etched) and your sound on/off choice, in your browser's local storage. You can clear them any time from your browser settings.",
  },
  {
    id: "fonts",
    heading: "Fonts and sound",
    body: "Fonts are served with the site and sounds play from local files. No third-party trackers are loaded.",
  },
  {
    id: "contact",
    heading: "Contact",
    body: "Questions? Reach out through the links on the About page.",
  },
];
