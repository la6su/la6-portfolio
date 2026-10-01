import { readonly, ref } from "vue";

export const noSceneRequested =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("no-scene");

const available = ref(typeof window === "undefined" || !noSceneRequested);

export const rendererAvailable = readonly(available);

export function setRendererAvailable(value: boolean): void {
  available.value = value;
}
