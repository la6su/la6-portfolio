// src/core/i18n.ts — Internationalization (EN/RU). The typed locale port.
//
// This module is the single locale read point for scene and UI code:
//   - `getLang(): Lang` and `t(key): string` are pull-based reads, so the
//     current language is decided at each use site (the Phase 5 swap to
//     typed Vue state only changes this module's source);
//   - `toggleLang()` is the sole writer; it persists to localStorage and
//     publishes the `jlz:lang-change` push event for the consumers that must
//     re-render (scene textures, noise text, meta tags).
// It is already unit-locked (`src/__tests__/i18n.test.ts`), including the
// EN/RU dictionary parity guard.
//
// Translation system: t(key) returns the translated string for the current
// language. data-i18n attributes on elements auto-translate on load, on
// language change, and on every route change (router calls applyTranslations
// after rendering new page HTML).
//
// Key naming convention (flat dot notation):
//   nav.*          — header nav labels
//   home.*         — home page cube-face sections (studio/services/works/...)
//   services.*     — services content page
//   works.*        — works content page (section titles; project names stay EN)
//   manifesto.*    — manifesto content page
//   lab.*          — lab content page
//   contact.*      — contact content page
//   meta.*         — per-page <title> + <meta description> (route-based SEO)
//   common.*       — shared CTAs (explore, readMore, send) + secret hints
//
// English text is always the default in templates (no-JS fallback).
// applyTranslations() only replaces textContent when a translation exists.

import { eventBus } from './EventBus'

export type Lang = 'EN' | 'RU'

const STORAGE_KEY = 'jlz:lang'

// ── Translation dictionaries ──
/** Complete EN/RU content data. Exported for the parity regression check. */
export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  EN: {
    // Splash

    // Navigation
    'nav.studio': 'Studio',
    'nav.services': 'Services',
    'nav.works': 'Works',
    'nav.manifesto': 'Manifesto',
    'nav.lab': 'Lab',
    'nav.contact': 'Contact',
    'nav.blog': 'Blog',

    // Menu section (section 5, two-column navigation template)
    'menu.navigate': 'Menu',

    // Cinematic shell + contact finale
    'story.hint': 'Scroll · swipe',
    'story.contact': 'Contact',
    'contactFooter.kicker': 'Final frame · open channel',
    'contactFooter.title': 'Let’s make something worth remembering.',
    'contactFooter.lead': 'Tell us where the story should go next.',
    'contactFooter.telegram': 'TG',

    // Common CTAs
    'common.explore': 'Explore',
    'common.close': 'Close',

    // Home — intro (Studio)
    'home.studio.title': 'Studio',
    'home.studio.lead': 'Technology with a point of view.',
    'home.studio.desc1': 'Distinctive digital solutions for your business.',
    'home.studio.desc2': 'Creative direction. Automation. Performance.',
    'home.studio.showreel': 'Showreel',

    // Home — about (Services)
    'home.about.title': 'Services',
    'home.about.lead': 'Your business sets the direction.',
    'home.about.desc1': 'We turn business context and data into a clear solution.',
    'home.about.desc2': 'Research, design and development in one process.',

    // Home — works
    'home.works.title': 'Works',

    // Home — contact (Manifesto face)
    'home.manifesto.title': 'Manifesto',
    'home.manifesto.lead': 'This is what guides us.',
    'home.manifesto.desc1': 'Understand the business.',
    'home.manifesto.desc2': 'Give every decision a purpose.',
    'home.manifesto.desc3': 'Make the result clear, fast and distinctive.',

    // Home — Contact

    // Home — lab

    // Services page
    'services.creativeDirection.title': 'Creative Direction',
    'services.creativeDirection.lead': 'Start with the business, its audience and its data.',
    'services.creativeDirection.statement':
      'Define the goal. Direct the story, design and technology around it.',
    'services.interactiveDev.title': 'Development',
    'services.interactiveDev.lead': 'Fast to ship, built around real tasks.',
    'services.interactiveDev.caption': 'Responsive input. Clear journeys. Measured performance.',
    'services.interactiveDev.detail':
      'One scene, one demand signal, one measurable reason to move.',
    'services.motionRealtime.title': 'Motion',
    'services.motionRealtime.lead': "Show how the product works and why it's worth choosing.",
    'services.motionRealtime.word1': 'Context',
    'services.motionRealtime.word2': 'Impulse',
    'services.motionRealtime.word3': 'Calm',
    'services.motionRealtime.detail':
      'Transitions are authored as states: context, impulse, calm — each settling on purpose.',
    'services.aiSystems.title': 'AI & automation',
    'services.aiSystems.lead': 'Automate the routine: content, handoffs and publishing.',
    'services.aiSystems.statement':
      'Shorten the path from idea to delivery. Keep people in control of important decisions.',
    'services.aiSystems.action': 'Start a project',
    'services.aiSystems.note': 'A short brief is enough to begin the conversation.',

    // Works page — section headers (project names stay English — proper nouns)
    'works.observatory': 'An observatory of ideas.',
    'works.enterCase': 'Inside the project',
    'works.viewMaterial': 'View material',
    'works.experiment': 'Selected work / art direction + creative development',
    'works.continue': 'Scroll to the next world ↓',
    'works.archive': 'The archive',
    'works.room1.premise': 'How can a car become the only thing in the frame?',
    'works.room1.context':
      'Porsche 911 Spider: light, silhouette and movement build a focused CG presence.',
    'works.room2.premise': 'Can form, texture and light hold one mood?',
    'works.room2.context':
      'Alise: a CG image system where material and measured movement form one character.',
    'works.room3.premise': 'How can a cosmetics product feel clear and close?',
    'works.room3.context':
      '19 Lab: a product website that makes care, detail and brand character easy to read.',
    'works.room4.premise': 'What makes a specialised store easy to choose from?',
    'works.room4.context':
      'Pro193: an online store for tall men, centred on fit, clothing and a clear path to product.',
    'works.enterRooms': 'Explore the four rooms',
    'works.section1.title': 'Motion & CG',
    'works.section2.title': 'Motion & CG',
    'works.section3.title': 'Product website',
    'works.section4.title': 'E-commerce',

    // Manifesto page
    'manifesto.purpose.title': 'Purpose',
    'manifesto.purpose.lead': "We don't build what everyone builds.",
    'manifesto.purpose.desc1': 'We solve different problems.',
    'manifesto.purpose.desc2': 'We improve experience and understand the pain.',
    'manifesto.clarity.title': 'Clarity',
    'manifesto.clarity.lead': 'Clean structure.',
    'manifesto.clarity.desc1': 'Clear logic.',
    'manifesto.clarity.desc2': 'No noise.',
    'manifesto.emotion.title': 'Emotion',
    'manifesto.emotion.lead': 'We use motion, light and interaction to create a sense of presence.',
    'manifesto.simplicity.title': 'Simplicity',
    'manifesto.simplicity.lead': 'We strive for minimalism — but not emptiness.',

    // Lab page
    'lab.shaderLab.title': 'Shader Lab',
    'lab.shaderLab.lead': 'GLSL & TSL fragments.',
    'lab.shaderLab.desc1': 'Glass, iridescence, fluid simulation.',
    'lab.shaderLab.desc2': 'Every visual effect starts here.',
    'lab.shaderLab.mode': 'TSL material study',
    'lab.audioReactive.title': 'Audio Reactive',
    'lab.audioReactive.lead': 'Web Audio → visuals.',
    'lab.audioReactive.desc1': 'Frequency-driven visuals.',
    'lab.audioReactive.desc2': 'Real-time analyser pipeline.',
    'lab.audioReactive.mode': 'Web Audio input',
    'lab.generative.title': 'Generative',
    'lab.generative.lead': 'Procedural worlds.',
    'lab.generative.desc1': 'Noise and math.',
    'lab.generative.desc2': 'Infinite variation from code.',
    'lab.generative.mode': 'Procedural system',
    'lab.gpuParticles.title': 'GPU Particles',
    'lab.gpuParticles.lead': '10k instanced points.',
    'lab.gpuParticles.desc1': 'On-demand rendering.',
    'lab.gpuParticles.desc2': 'Zero idle draw calls.',
    'lab.gpuParticles.mode': 'Performance study',
    'lab.sceneState': 'Isolated scene · in development',
    'lab.readNote': 'Read development note',

    // Contact page
    'contact.email.title': 'Email',
    'contact.email.heading': 'Start here.',
    'contact.email.meta': 'For new work, questions and good ideas.',
    'contact.social.title': 'Social',
    'contact.social.lead': 'Find us',
    'contact.social.heading': 'Keep in touch.',
    'contact.social.telegram': 'The quickest way to start.',
    'contact.social.github': 'Open work and experiments.',
    'contact.location.title': 'Location',
    'contact.location.heading': 'Find us here.',
    'contact.location.caption': 'A quiet base in the Troodos mountains.',
    'contact.form.title': 'Start',
    'contact.form.heading': 'Make the move.',
    'contact.form.action': 'Start a project',
    'contact.form.meta': 'We will return with the right next question.',

    // Secret-section hints

    // Navigation help labels

    // Meta (route-based SEO)
    'meta.home.title': 'JUSTLOVEJAZZ — Design, Technology & Automation',
    'meta.home.description':
      'Distinctive digital solutions for business. Creative direction, design and development shaped by your goals, data and performance needs.',
    'meta.services.title': 'Services — JUSTLOVEJAZZ',
    'meta.services.description':
      'Creative direction, websites, interactive experiences and AI automation. From understanding your business to design and implementation.',
    'meta.works.title': 'Works — JUSTLOVEJAZZ',
    'meta.works.description':
      'Selected projects in design, motion and development. Explore the intent, decisions and materials behind each case.',
    'meta.manifesto.title': 'Manifesto — JUSTLOVEJAZZ',
    'meta.manifesto.description':
      'Purpose, clarity, emotion, simplicity. The principles that guide our work.',
    'meta.lab.title': 'Lab — JUSTLOVEJAZZ',
    'meta.lab.description':
      'Experiments in shaders, interactive interfaces and realtime 3D. A place to test ideas for future digital experiences.',
    'meta.contact.title': 'Contact — JUSTLOVEJAZZ',
    'meta.contact.description':
      'Get in touch. Email, Telegram, GitHub. Remote · EU · open for new projects.',
  },

  RU: {
    // Splash

    // Navigation
    'nav.studio': 'Студия',
    'nav.services': 'Услуги',
    'nav.works': 'Работы',
    'nav.manifesto': 'Манифест',
    'nav.lab': 'Лаборатория',
    'nav.contact': 'Контакты',
    'nav.blog': 'Блог',

    // Menu overlay (RU)
    'menu.navigate': 'Меню',

    // Cinematic shell + contact finale
    'story.hint': 'Листайте · свайпайте',
    'story.contact': 'Связаться',
    'contactFooter.kicker': 'Финальный кадр · открытый канал',
    'contactFooter.title': 'Давайте создадим то, что хочется запомнить.',
    'contactFooter.lead': 'Расскажите, куда должна продолжиться эта история.',
    'contactFooter.telegram': 'TG',

    // Lab section (RU)
    // Common CTAs
    'common.explore': 'Исследовать',
    'common.close': 'Закрыть',

    // Home — intro (Studio)
    'home.studio.title': 'Студия',
    'home.studio.lead': 'Технологии с характером.',
    'home.studio.desc1': 'Выразительные цифровые решения для бизнеса.',
    'home.studio.desc2': 'Режиссура. Автоматизация. Производительность.',
    'home.studio.showreel': 'Шоурил',

    // Home — about (Services)
    'home.about.title': 'Услуги',
    'home.about.lead': 'Ваш бизнес задаёт направление.',
    'home.about.desc1': 'Превращаем задачи и данные бизнеса в ясное решение.',
    'home.about.desc2': 'Исследование, дизайн и разработка в одном процессе.',

    // Home — works
    'home.works.title': 'Работы',

    // Home — contact (Manifesto face)
    'home.manifesto.title': 'Манифест',
    'home.manifesto.lead': 'То, что нами движет.',
    'home.manifesto.desc1': 'Понять бизнес.',
    'home.manifesto.desc2': 'Дать каждому решению смысл.',
    'home.manifesto.desc3': 'Сделать результат понятным, быстрым и выразительным.',

    // Home — Contact

    // Home — lab

    // Services page
    'services.creativeDirection.title': 'Креатив',
    'services.creativeDirection.lead': 'Начать с бизнеса, его аудитории и данных.',
    'services.creativeDirection.statement':
      'Определить цель. Связать с ней историю, дизайн и технологии.',
    'services.interactiveDev.title': 'Разработка',
    'services.interactiveDev.lead': 'Быстрый запуск — и фокус на реальных задачах.',
    'services.interactiveDev.caption':
      'Быстрый отклик. Понятный путь. Измеримая производительность.',
    'services.interactiveDev.detail':
      'Одна сцена, один сигнал спроса, одна измеримая причина двигаться.',
    'services.motionRealtime.title': 'Моушн',
    'services.motionRealtime.lead': 'Показать, как работает продукт и почему его выбирают.',
    'services.motionRealtime.word1': 'Контекст',
    'services.motionRealtime.word2': 'Импульс',
    'services.motionRealtime.word3': 'Покой',
    'services.motionRealtime.detail':
      'Транзишены собраны как состояния: контекст, импульс, покой — каждое оседает осознанно.',
    'services.aiSystems.title': 'AI и автоматизация',
    'services.aiSystems.lead': 'Автоматизируем рутину: контент, передачи и публикацию.',
    'services.aiSystems.statement':
      'Сократить путь от идеи до результата. Сохранить контроль человека над важными решениями.',
    'services.aiSystems.action': 'Начать проект',
    'services.aiSystems.note': 'Для начала разговора достаточно короткого брифа.',

    // Works page — section headers
    'works.observatory': 'Обсерватория идей.',
    'works.enterCase': 'Внутри проекта',
    'works.viewMaterial': 'Смотреть материал',
    'works.experiment': 'Избранная работа / арт-дирекшн + разработка',
    'works.continue': 'Дальше — другой мир ↓',
    'works.archive': 'Архив',
    'works.room1.premise': 'Как сделать автомобиль единственным героем кадра?',
    'works.room1.context':
      'Porsche 911 Spider: свет, силуэт и движение создают собранное CG-присутствие.',
    'works.room2.premise': 'Могут ли форма, фактура и свет удержать одно настроение?',
    'works.room2.context':
      'Alise: CG-система, где материал и сдержанное движение собирают один характер.',
    'works.room3.premise': 'Как сделать косметический продукт понятным и близким?',
    'works.room3.context': '19 Lab: сайт о продукте, заботе, деталях и характере бренда.',
    'works.room4.premise': 'Что делает специализированный магазин понятным с первого шага?',
    'works.room4.context':
      'Pro193: интернет-магазин для высоких мужчин, построенный вокруг посадки, вещей и ясного выбора.',
    'works.enterRooms': 'Войти в четыре комнаты',
    'works.section1.title': 'Моушн и CG',
    'works.section2.title': 'Моушн и CG',
    'works.section3.title': 'Продуктовый сайт',
    'works.section4.title': 'E-commerce',

    // Manifesto page
    'manifesto.purpose.title': 'Цель',
    'manifesto.purpose.lead': 'Мы не делаем то, что делают все.',
    'manifesto.purpose.desc1': 'Мы решаем другие задачи.',
    'manifesto.purpose.desc2': 'Мы улучшаем опыт и понимаем боль.',
    'manifesto.clarity.title': 'Ясность',
    'manifesto.clarity.lead': 'Чистая структура.',
    'manifesto.clarity.desc1': 'Чёткая логика.',
    'manifesto.clarity.desc2': 'Без шума.',
    'manifesto.emotion.title': 'Эмоция',
    'manifesto.emotion.lead':
      'Мы используем движение, свет и взаимодействие, чтобы создать чувство присутствия.',
    'manifesto.simplicity.title': 'Простота',
    'manifesto.simplicity.lead': 'Мы стремимся к минимализму — но не к пустоте.',

    // Lab page
    'lab.shaderLab.title': 'Шейдерная лаборатория',
    'lab.shaderLab.lead': 'GLSL и TSL фрагменты.',
    'lab.shaderLab.desc1': 'Стекло, иридесценция, симуляция жидкостей.',
    'lab.shaderLab.desc2': 'Каждый визуальный эффект начинается здесь.',
    'lab.shaderLab.mode': 'Исследование TSL-материалов',
    'lab.audioReactive.title': 'Аудио-реактивность',
    'lab.audioReactive.lead': 'Web Audio → визуал.',
    'lab.audioReactive.desc1': 'Частотно-управляемая графика.',
    'lab.audioReactive.desc2': 'Реалтайм анализатор.',
    'lab.audioReactive.mode': 'Ввод Web Audio',
    'lab.generative.title': 'Генеративное',
    'lab.generative.lead': 'Процедурные миры.',
    'lab.generative.desc1': 'Шум и математика.',
    'lab.generative.desc2': 'Бесконечное разнообразие из кода.',
    'lab.generative.mode': 'Процедурная система',
    'lab.gpuParticles.title': 'GPU-частицы',
    'lab.gpuParticles.lead': '10k инстансированных точек.',
    'lab.gpuParticles.desc1': 'Рендеринг по требованию.',
    'lab.gpuParticles.desc2': 'Ноль холостых draw calls.',
    'lab.gpuParticles.mode': 'Исследование производительности',
    'lab.sceneState': 'Изолированная сцена · в разработке',
    'lab.readNote': 'Читать заметку разработки',

    // Contact page
    'contact.email.title': 'Почта',
    'contact.email.heading': 'Ну, здрасте `-)',
    'contact.email.meta': 'Для новых проектов, вопросов и хороших идей.',
    'contact.social.title': 'Соцсети',
    'contact.social.lead': 'Найдите нас',
    'contact.social.heading': 'Как дела?',
    'contact.social.telegram': 'Самый быстрый способ начать.',
    'contact.social.github': 'Открытые работы и эксперименты.',
    'contact.location.title': 'Локация',
    'contact.location.heading': 'Мы здесь.',
    'contact.location.caption': 'Тихая база в горах Троодос.',
    'contact.form.title': 'Старт',
    'contact.form.heading': 'Сделаем шаг.',
    'contact.form.action': 'Начать проект',
    'contact.form.meta': 'Вернёмся с правильным следующим вопросом.',

    // Secret-section hints

    // Navigation help labels

    // Meta (route-based SEO)
    'meta.home.title': 'JUSTLOVEJAZZ — Дизайн, технологии и автоматизация',
    'meta.home.description':
      'Выразительные цифровые решения для бизнеса. Режиссёрский подход, дизайн и разработка с опорой на ваши задачи, данные и производительность.',
    'meta.services.title': 'Услуги — JUSTLOVEJAZZ',
    'meta.services.description':
      'Креативная режиссура, сайты, интерактивные решения и AI-автоматизация. От понимания бизнеса до дизайна и реализации.',
    'meta.works.title': 'Работы — JUSTLOVEJAZZ',
    'meta.works.description':
      'Избранные проекты в дизайне, моушне и разработке. Задачи, решения и материалы каждого кейса.',
    'meta.manifesto.title': 'Манифест — JUSTLOVEJAZZ',
    'meta.manifesto.description':
      'Цель, ясность, эмоция, простота. Принципы, направляющие нашу работу.',
    'meta.lab.title': 'Лаборатория — JUSTLOVEJAZZ',
    'meta.lab.description':
      'Эксперименты с шейдерами, интерактивными интерфейсами и 3D в реальном времени. Проверяем идеи для будущих цифровых решений.',
    'meta.contact.title': 'Контакты — JUSTLOVEJAZZ',
    'meta.contact.description':
      'Свяжитесь с нами. Почта, Telegram, GitHub. Удалённо · ЕС · открыты для новых проектов.',
  },
}

let currentLang: Lang = 'EN'

/** Initialize i18n — load saved language, apply translations. */
export function initI18n(): void {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  // Initialization is a complete state load, not a conditional mutation.
  // Resetting to EN for an absent/invalid value keeps repeated boot/HMR
  // deterministic instead of leaking a previous module-scoped RU value.
  currentLang = saved === 'RU' ? 'RU' : 'EN'
  applyTranslations()
}

/** Get current language. */
export function getLang(): Lang {
  return currentLang
}

/** Toggle EN ↔ RU. */
export function toggleLang(): Lang {
  currentLang = currentLang === 'EN' ? 'RU' : 'EN'
  try {
    localStorage.setItem(STORAGE_KEY, currentLang)
  } catch {
    /* ignore */
  }
  applyTranslations()
  eventBus.emit('jlz:lang-change', { lang: currentLang })
  return currentLang
}

/** Translate a key. Returns key itself if not found. */
export function t(key: string): string {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.EN?.[key] ?? key
}

/** Apply translations to all [data-i18n] elements in the document.
 *  Also handles data-i18n-placeholder for input placeholder attributes. */
export function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (key) el.textContent = t(key)
  })
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key && el instanceof HTMLInputElement) el.placeholder = t(key)
  })
}
