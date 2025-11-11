// 配達関連のヘルパー

export const getDayOfWeek = (dateString: string): string => {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const date = new Date(dateString);
  return days[date.getDay()];
};