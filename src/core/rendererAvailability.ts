import { readonly, ref } from "vue";

const available = ref(
  typeof window === "undefined" ||
    !new URLSearchParams(window.location.search).has("no-scene"),
);

export const rendererAvailable = readonly(available);

export function setRendererAvailable(value: boolean): void {
  available.value = value;
}
