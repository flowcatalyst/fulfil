import type { Notice } from './notice.js';

export interface NoticeRepository {
  save(notice: Notice): Promise<void>;
}
