/* ============================================================
   Отправка заявок — «переключаемый» адаптер.
   Приёмник (Telegram / e-mail / Bitrix24) решаем позже:
   меняется только константа ENDPOINT + тело fetch.
   Сейчас: без бэкенда — логируем и шлём цель в Яндекс.Метрику.
   ============================================================ */

export type LeadPayload = Record<string, string | string[]>;

// Тип заявки → имя цели в Метрике
const GOALS: Record<string, string> = {
  quiz: 'quiz_complete',
  form: 'lead_form',
  callback: 'callback_request',
  sample: 'sample_request',
};

declare global {
  interface Window {
    ym?: (id: number, action: string, goal?: string, params?: unknown) => void;
  }
}

const YM_ID = 0; // TODO: вставить реальный номер счётчика Метрики

function reachGoal(kind: string, payload: LeadPayload) {
  const goal = GOALS[kind] ?? 'lead_generic';
  try {
    if (YM_ID && typeof window.ym === 'function') {
      window.ym(YM_ID, 'reachGoal', goal, payload);
    }
  } catch {
    /* no-op */
  }
  // видно в консоли до подключения Метрики
  console.info('[lead] goal:', goal, payload);
}

// UTM-метки прокидываем в заявку (атрибуция кампании Директа)
function utmParams(): LeadPayload {
  const q = new URLSearchParams(location.search);
  const out: LeadPayload = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = q.get(k);
    if (v) out[k] = v;
  });
  out.page = location.pathname;
  return out;
}

/**
 * Отправить заявку. Возвращает true при успехе.
 * kind: 'quiz' | 'form' | 'callback' | 'sample'
 */
export async function sendLead(kind: string, data: LeadPayload): Promise<boolean> {
  const payload = { kind, ...data, ...utmParams(), ts: new Date().toISOString() };

  // --- ЗАГЛУШКА: пока нет бэкенда, считаем отправку успешной. ---
  // Когда появится приёмник — раскомментировать и указать ENDPOINT:
  //
  // const ENDPOINT = '/api/lead';
  // const res = await fetch(ENDPOINT, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(payload),
  // });
  // const ok = res.ok;
  const ok = true;

  if (ok) reachGoal(kind, data);
  return ok;
}
