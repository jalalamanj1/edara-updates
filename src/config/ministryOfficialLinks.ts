// Centralized configuration for the official Ministry of Education (Iraq) accounts and portals.
// These are static, official reference links shown on the Dashboard. No external API or scraping is used.

export type MinistryOfficialPlatform =
  | 'instagram'
  | 'telegram'
  | 'facebook'
  | 'orPortal'
  | 'x';

export interface MinistryOfficialLink {
  platform: MinistryOfficialPlatform;
  /** Platform display name (e.g. Instagram, Telegram, Facebook, X) */
  platformName: string;
  /** Account / site display name */
  accountName: string;
  /** Short description */
  description: string;
  /** Official URL (opened in an external tab/window) */
  url: string;
}

export const OFFICIAL_MINISTRY_LINKS: MinistryOfficialLink[] = [
  {
    platform: 'instagram',
    platformName: 'Instagram',
    accountName: 'وزارة التربية العراقية على Instagram',
    description: 'الحساب الرسمي لوزارة التربية العراقية على Instagram',
    url: 'https://www.instagram.com/iraq.ministryofeducation/?hl=ar',
  },
  {
    platform: 'telegram',
    platformName: 'Telegram',
    accountName: 'وزارة التربية العراقية على Telegram',
    description: 'القناة الرسمية والموثقة لوزارة التربية العراقية على Telegram',
    url: 'https://t.me/s/Educationiq',
  },
  {
    platform: 'facebook',
    platformName: 'Facebook',
    accountName: 'وزارة التربية العراقية على Facebook',
    description: 'الصفحة الرسمية لوزارة التربية العراقية على Facebook',
    url: 'https://www.facebook.com/Iraq.Ministry.of.Education/?locale=ar_AR',
  },
  {
    platform: 'orPortal',
    platformName: 'بوابة أور',
    accountName: 'بوابة أور للخدمات الحكومية',
    description: 'الخدمات الإلكترونية الحكومية المرتبطة بوزارة التربية عبر بوابة أور',
    url: 'https://ur.gov.iq/index/show-eservice/50529/10053/cat',
  },
  {
    platform: 'x',
    platformName: 'X',
    accountName: 'وزارة التربية العراقية على X',
    description: 'الحساب الرسمي لوزارة التربية العراقية على منصة X',
    url: 'https://x.com/moedu_iq?lang=ar',
  },
];
