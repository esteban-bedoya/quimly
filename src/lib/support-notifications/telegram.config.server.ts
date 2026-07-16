import "server-only";

type TelegramSupportAlertConfig = {
  botToken: string;
  chatId: string;
};

export function getTelegramSupportAlertConfig(): TelegramSupportAlertConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return null;
  }

  return { botToken, chatId };
}
