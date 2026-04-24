import { createApp, type Plugin } from 'vue';
// PrimeVue's config module has a broken d.ts (missing default export re-declaration).
// The cast through unknown is required until upstream fixes the type declarations.
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import App from './App.vue';

const app = createApp(App);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(PrimeVue as unknown as Plugin, {
  theme: {
    preset: Aura,
  },
});

app.mount('#app');
