export const randomColor = () => 'hsl(' + Math.floor(Math.random() * 360) + ', 100%, 50%)';

export const uniqueColors = (n: number) => {
  const step = 360 / n;
  const randomStart = Math.floor(Math.random() * step);
  const colors = [];
  for (let i = 0; i < n; i++) {
    colors.push('hsl(' + ((randomStart + Math.floor(i * step)) % 360) + ', 100%, 50%)');
  }

  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors;
};

export const hashColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 'hsl(' + (hash % 360) + ', 100%, 40%)';
};
