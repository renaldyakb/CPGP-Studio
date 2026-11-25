import type {
  TimeSlotDefinition,
  WorkspacePresetId,
  WorkspaceRuleConfig,
} from './types/workspace.ts';

export const DEFAULT_TIME_SLOTS: Record<string, TimeSlotDefinition> = {
  '01': {
    code: '01',
    label: 'Siang',
    window: '11.30 - 12.00 WIB',
    defaultTime: '11:30',
    recommendation:
      'Menyasar jam istirahat makan siang saat audiens membuka HP sambil santai.',
  },
  '02': {
    code: '02',
    label: 'Malam',
    window: '19.30 - 20.00 WIB',
    defaultTime: '19:30',
    recommendation:
      'Jam prime time saat orang beristirahat di rumah dan menyimak cerita hingga habis.',
  },
};

export interface RulePresetDescriptor {
  id: WorkspacePresetId;
  title: string;
  badge: string;
  summary: string;
  exampleTree: string[];
  buildRules: (handle?: string) => WorkspaceRuleConfig;
}

export const WORKSPACE_RULE_PRESETS: Record<
  WorkspacePresetId,
  RulePresetDescriptor
> = {
  jurnal_dunia: {
    id: 'jurnal_dunia',
    title: 'Wajib wm_final.mp4 Terpisah (Standar Studio)',
    badge: 'Ketat · 4 Berkas',
    summary:
      'Video mentah harus melewati tahap render watermark menjadi wm_final.mp4. Konten baru berstatus Siap Upload jika wm_final.mp4, cover, dan caption.txt sudah lengkap.',
    exampleTree: [
      '2026-November/',
      '  24.01/',
      '    video-mentah.mp4        (Video mentah)',
      '    wm_final.mp4            (Video siap upload - Wajib)',
      '    cover-9x16.jpg          (Thumbnail 9:16 - Wajib)',
      '    caption.txt             (Caption & hashtag - Wajib)',
    ],
    buildRules: (handle = '@channel_anda') => {
      const cleanTag = handle.replace(/^@/, '#').replace(/[^a-zA-Z0-9_#]/g, '').toLowerCase();
      const defaultHashtags = ['#edukasi', cleanTag && cleanTag !== '#' ? cleanTag : '#konten'];
      return {
        presetId: 'jurnal_dunia',
        folderStructure: 'auto_both',
        watermarkPolicy: 'separate_wm_file',
        requiredAssets: {
          video: true,
          cover: true,
          caption: true,
        },
        fileRules: {
          rawVideoRegex:
            '^motionprovit-([a-z0-9_-]+?)(?:-(\\d+x\\d+))?\\.(mp4|mov|mkv|webm)$',
          wmVideoRegex: '^wm_final(?:\\s*\\(\\d+\\))?\\.(mp4|mov|mkv|webm)$',
          coverRegex:
            '^cover-([a-z0-9_-]+?)(?:-(\\d+x\\d+))?\\.(jpg|jpeg|png|webp)$',
          captionFileName: 'caption.txt',
        },
        defaultHashtags,
        captionTemplate: `Tulis kalimat hook pertanyaan utama di sini?\n\nMenurut kamu bagaimana? Tulis di komentar.\n\n${defaultHashtags.join(' ')}`,
      };
    },
  },
  standard_creator: {
    id: 'standard_creator',
    title: 'Video Langsung Siap Upload (Fleksibel)',
    badge: 'Fleksibel · Tanpa Wajib wm_final',
    summary:
      'Cocok jika video .mp4 Anda sudah memiliki watermark dari CapCut/Premiere. File .mp4 apa pun di dalam folder langsung terbaca Siap Upload. Anda tetap bisa memakai Watermark Studio kapan saja.',
    exampleTree: [
      'November/',
      '  24.01/',
      '    video-konten.mp4        (Langsung siap upload)',
      '    cover.jpg               (Thumbnail - Opsional/Wajib)',
      '    caption.txt             (Caption & hashtag)',
    ],
    buildRules: (handle = '@channel_') => {
      const cleanTag = handle.replace(/^@/, '#').replace(/[^a-zA-Z0-9_#]/g, '').toLowerCase();
      const defaultHashtags = ['#shorts', '#reels', ...(cleanTag && cleanTag !== '#' ? [cleanTag] : [])];
      return {
        presetId: 'standard_creator',
        folderStructure: 'auto_both',
        watermarkPolicy: 'direct_or_wm',
        requiredAssets: {
          video: true,
          cover: false,
          caption: true,
        },
        fileRules: {
          rawVideoRegex: '^(?!wm_final).+\\.(mp4|mov|mkv|webm)$',
          wmVideoRegex: '^wm_final(?:\\s*\\(\\d+\\))?\\.(mp4|mov|mkv|webm)$',
          coverRegex: '^.+\\.(jpg|jpeg|png|webp)$',
          captionFileName: 'caption.txt',
        },
        defaultHashtags,
        captionTemplate: `Tulis hook pembuka video di sini.\n\nTulis pendapatmu di kolom komentar.\n\n${defaultHashtags.join(' ')}`,
      };
    },
  },
  overwrite_creator: {
    id: 'overwrite_creator',
    title: 'Render Watermark & Timpa Video Asli (Overwrite)',
    badge: 'Hemat Disk · 1 File Video',
    summary:
      'Cukup taruh 1 file video .mp4 di folder. Saat di-render di Watermark Studio, watermark langsung menimpa file video tersebut secara aman tanpa membuat file kedua.',
    exampleTree: [
      'November/',
      '  24.01/',
      '    video.mp4               (Di-render & ditimpa langsung)',
      '    cover.jpg               (Thumbnail 9:16)',
      '    caption.txt             (Caption & hashtag)',
    ],
    buildRules: (handle = '@channel_') => {
      const cleanTag = handle.replace(/^@/, '#').replace(/[^a-zA-Z0-9_#]/g, '').toLowerCase();
      const defaultHashtags = ['#edukasi', ...(cleanTag && cleanTag !== '#' ? [cleanTag] : [])];
      return {
        presetId: 'overwrite_creator',
        folderStructure: 'auto_both',
        watermarkPolicy: 'overwrite_source',
        requiredAssets: {
          video: true,
          cover: false,
          caption: true,
        },
        fileRules: {
          rawVideoRegex: '^.+\\.(mp4|mov|mkv|webm)$',
          wmVideoRegex: '^wm_final(?:\\s*\\(\\d+\\))?\\.(mp4|mov|mkv|webm)$',
          coverRegex: '^.+\\.(jpg|jpeg|png|webp)$',
          captionFileName: 'caption.txt',
        },
        defaultHashtags,
        captionTemplate: `Tulis hook pembuka video di sini.\n\nTulis pendapatmu di kolom komentar.\n\n${defaultHashtags.join(' ')}`,
      };
    },
  },
};
