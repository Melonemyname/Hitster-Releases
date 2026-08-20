<template>
  <div v-if="entries.length" class="avatar-stack" :class="{ 'avatar-stack--dense': dense }">
    <q-avatar
      v-for="(entry, i) in entries"
      :key="(entry.username || '') + i"
      :size="size"
      class="avatar-stack__item"
      :style="i === 0 ? {} : { marginLeft: `-${overlap}px` }"
    >
      <img
        v-if="urlFor(entry.avatar)"
        :src="urlFor(entry.avatar)"
        :alt="entry.username || 'Profilbild'"
      />
      <q-icon v-else name="person" :size="iconSize" />
      <q-tooltip v-if="entry.username">{{ entry.username }}</q-tooltip>
    </q-avatar>
  </div>
</template>

<script>
import { computed } from "vue";
import { avatarUrl } from "../utils/profileService";

/**
 * Überlappender Stapel runder Profilbilder (für Team-Slots). Erwartet
 * `entries` als Array von { username, avatar }, wobei `avatar` der rohe
 * Server-Pfad (oder null) ist. Fehlt ein Bild, wird ein Personen-Icon als
 * Fallback gezeigt. Reines Anzeige-Element, folgt dem App-Theme.
 */
export default {
  name: "AvatarStack",
  props: {
    /** [{ username, avatar }] – avatar = roher Pfad oder null. */
    entries: {
      type: Array,
      default: () => [],
    },
    /** Größe der einzelnen Avatare (q-avatar size). */
    size: {
      type: String,
      default: "28px",
    },
    /** Überlappung in px (negatives margin ab dem zweiten Avatar). */
    overlap: {
      type: Number,
      default: 10,
    },
    /** Kleinere Ringe/Abstände (z. B. in kompakten Listen). */
    dense: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const urlFor = (path) => avatarUrl(path);
    const iconSize = computed(() => {
      const n = parseInt(props.size, 10);
      return Number.isFinite(n) ? `${Math.round(n * 0.62)}px` : "18px";
    });
    return { urlFor, iconSize };
  },
};
</script>

<style scoped>
.avatar-stack {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
/* Runder Trennring, damit sich überlappende Bilder klar abheben. Folgt der
   Theme-Surface-Farbe statt eines festen Wertes. */
.avatar-stack__item {
  border: 2px solid var(--surface-bg, rgba(20, 20, 24, 0.72));
  background: var(--surface-bg-weak, rgba(255, 255, 255, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.avatar-stack--dense .avatar-stack__item {
  border-width: 1px;
}
.avatar-stack__item img {
  object-fit: cover;
}
.avatar-stack__item .q-icon {
  color: var(--app-on-accent, #fff);
  opacity: 0.85;
}
</style>
