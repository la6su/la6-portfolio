<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ShowreelState } from "../Experience/World/ShowreelTheater";
import { eventBus } from "../core/EventBus";
import { noSceneRequested } from "../core/sceneMode";

const state = ref<ShowreelState>({
  phase: "closed",
  playing: false,
  time: 0,
  duration: 0,
});
let restoreFocus: HTMLElement | null = null;
const enabled = !noSceneRequested;
const announcement = ref("");
const unsubs: Array<() => void> = [];

const phaseLabel = computed(() => {
  if (state.value.phase === "open")
    return state.value.playing ? "SIGNAL LOCKED" : "HOLD";
  return state.value.phase === "exit" ? "CLOSING" : "ACQUIRING";
});
const playLabel = computed(() => (state.value.playing ? "PLAY" : "PAUSE"));
const progress = computed(() => {
  const { time, duration } = state.value;
  return duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
});

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

function onState(next: ShowreelState): void {
  const previous = state.value;
  const wasClosed = previous.phase === "closed";
  const wasOpen = !wasClosed;
  state.value = next;
  if (next.phase === previous.phase && next.playing === previous.playing)
    return;
  if (next.phase === "closed") {
    if (wasOpen) hideChrome();
    announce("Showreel closed");
    return;
  }
  if (wasClosed) showChrome();
  if (wasOpen && next.phase === "open") announce("Showreel playing");
}

function onKeydown(event: KeyboardEvent): void {
  if (state.value.phase === "closed") return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    eventBus.emit("jlz:showreel-close");
  } else if (event.key === " ") {
    event.preventDefault();
    event.stopImmediatePropagation();
    eventBus.emit("jlz:showreel-toggle-play");
  }
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("#jlz-showreel-trigger")) return;
  event.preventDefault();
  restoreFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  eventBus.emit("jlz:showreel-open");
}

function onBackdropClick(): void {
  eventBus.emit("jlz:showreel-toggle-play");
}

function onCloseMediaLayer(): void {
  if (state.value.phase !== "closed") eventBus.emit("jlz:showreel-close");
}

function showChrome(): void {
  eventBus.emit("jlz:close-nav");
  eventBus.emit("jlz:fullscreen-change", { open: true });
  document.body.classList.add("jlz-media-layer-open");
  document.getElementById("jlz-menu-launcher")?.focus({ preventScroll: true });
}

function hideChrome(): void {
  eventBus.emit("jlz:fullscreen-change", { open: false });
  document.body.classList.remove("jlz-media-layer-open");
  restoreFocus?.focus({ preventScroll: true });
  restoreFocus = null;
}

function announce(message: string): void {
  announcement.value = message;
}

onMounted(() => {
  if (!enabled) return;
  unsubs.push(
    eventBus.on("jlz:showreel-state", onState),
    eventBus.on("jlz:close-media-layer", onCloseMediaLayer),
  );
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onDocumentClick);
});

onBeforeUnmount(() => {
  unsubs.splice(0).forEach((unsubscribe) => unsubscribe());
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onDocumentClick);
  if (state.value.phase !== "closed") {
    eventBus.emit("jlz:fullscreen-change", { open: false });
    document.body.classList.remove("jlz-media-layer-open");
  }
});
</script>

<template>
  <div
    v-if="enabled"
    id="jlz-showreel-console"
    class="jlz-showreel-console"
    :data-state="state.phase === 'closed' ? 'closed' : 'open'"
    data-no-magnetic
    @click.self="onBackdropClick"
    @wheel.prevent.stop
    @touchmove.prevent.stop
  >
    <header class="jlz-showreel-console__meta">
      <span class="jlz-showreel-console__signal" aria-hidden="true"></span>
      <span class="jlz-showreel-console__name">SHOWREEL.MP4</span>
      <span class="jlz-showreel-console__phase" aria-hidden="true">{{
        phaseLabel
      }}</span>
      <span class="jlz-showreel-console__sr" aria-live="polite">{{
        announcement
      }}</span>
    </header>
    <footer class="jlz-showreel-console__status" aria-hidden="true">
      <span class="jlz-showreel-console__state">{{ playLabel }}</span>
      <span class="jlz-showreel-console__track">
        <span
          class="jlz-showreel-console__progress"
          :style="{ '--jlz-showreel-progress': `${progress}%` }"
        ></span>
      </span>
      <span class="jlz-showreel-console__time">
        <span class="jlz-showreel-console__time-now">{{
          formatTime(state.time)
        }}</span>
        /
        <span class="jlz-showreel-console__time-total">{{
          formatTime(state.duration)
        }}</span>
      </span>
    </footer>
  </div>
</template>
