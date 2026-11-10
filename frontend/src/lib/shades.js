/**
 * Leyah's gel colour chart: the Conspiracy Theories collection, swatches #01 to #58 in the order of the chart.
 * A booking stores the shade as its number ("#06"); the list the server accepts is Booking:NailColors in appsettings.json.
 * The colours are matched to the chart photo, for the swatches on screen only.
 */
export const COLLECTION = { name: 'Conspiracy Theories', code: '#A58' }

export const SHADE_COLORS = {
  '01': '#f7f3ee', '02': '#f2ebe2', '03': '#e5c892', '04': '#deb6a0', '05': '#d89f95',
  '06': '#e58ca9', '07': '#e59a88', '08': '#e99174', '09': '#e1404c', '10': '#ec4b56',
  '11': '#b6a59f', '12': '#969aa0', '13': '#81aee6', '14': '#828dc2', '15': '#bbb405',
  '16': '#c4c229', '17': '#f5b507', '18': '#e38704', '19': '#f16303', '20': '#f45101',
  '21': '#7fcf82', '22': '#77d2a9', '23': '#40c6c1', '24': '#01a2b8', '25': '#024c65',
  '26': '#0375e4', '27': '#033ec1', '28': '#071690', '29': '#16107b', '30': '#1d1e34',
  '31': '#ebaa77', '32': '#c97e52', '33': '#ad5c3a', '34': '#c9897c', '35': '#96513c',
  '36': '#7c4030', '37': '#284849', '38': '#879903', '39': '#a19637', '40': '#dac58a',
  '41': '#e978a9', '42': '#c33c98', '43': '#8931bd', '44': '#7c277a', '45': '#9f4b63',
  '46': '#603658', '47': '#ac5376', '48': '#bf0958', '49': '#e74266', '50': '#ea495d',
  '51': '#c70110', '52': '#c0011d', '53': '#86042d', '54': '#6f051d', '55': '#a00529',
  '56': '#861f1a', '57': '#66211e', '58': '#501c22',
}

/**
 * The name and a short description of each shade, from Leyah's list. Where her list gives one name for a few shades
 * (such as "caramel, mocha, chocolate brown" for #33–#36), each shade got its own name in that order.
 */
export const SHADE_NAMES = {
  '01': { name: 'Bright White', description: 'A crisp, clean white that makes any set look fresh and polished.' },
  '02': { name: 'Soft White', description: 'A gentle, milky white for a soft and natural clean look.' },
  '03': { name: 'Ivory Cream', description: 'A warm cream with a hint of ivory, subtle and elegant.' },
  '04': { name: 'Beige', description: 'A soft beige nude that goes with every outfit.' },
  '05': { name: 'Pale Grey-Lilac', description: 'A pale grey with a whisper of lilac, calm and modern.' },
  '06': { name: 'Light Pink-Lavender', description: 'A light pink with a touch of lavender, sweet and dreamy.' },
  '07': { name: 'Pastel Pink', description: 'A soft pastel pink, delicate and feminine.' },
  '08': { name: 'Peachy Blush', description: 'A warm peachy blush that flatters every skin tone.' },
  '09': { name: 'Rose Pink', description: 'A bright rose pink, fresh and cheerful.' },
  '10': { name: 'Coral Pink', description: 'A lively coral pink with a warm summer glow.' },
  '11': { name: 'Light Grey', description: 'A soft light grey, simple and chic.' },
  '12': { name: 'Blue-Grey', description: 'A cool blue-grey with a calm, stormy feel.' },
  '13': { name: 'Periwinkle', description: 'A soft periwinkle blue, light and airy.' },
  '14': { name: 'Soft Blue-Lavender', description: 'A gentle blue with a lavender tint, soft and dreamy.' },
  '15': { name: 'Lime Green', description: 'A zesty lime green that stands out.' },
  '16': { name: 'Chartreuse', description: 'A bright yellow-green, bold and playful.' },
  '17': { name: 'Sunny Yellow', description: 'A cheerful sunny yellow, perfect for bright days.' },
  '18': { name: 'Warm Sunny Yellow', description: 'A deeper, golden sunny yellow with a warm glow.' },
  '19': { name: 'Orange', description: 'A vivid orange, fun and full of energy.' },
  '20': { name: 'Burnt Orange', description: 'A rich burnt orange with a warm, earthy feel.' },
  '21': { name: 'Mint', description: 'A fresh, soft mint green, cool and clean.' },
  '22': { name: 'Seafoam', description: 'A light seafoam green, breezy and calm.' },
  '23': { name: 'Aqua', description: 'A bright aqua that feels like clear tropical water.' },
  '24': { name: 'Teal Blue', description: 'A vibrant teal blue, bold and refreshing.' },
  '25': { name: 'Deep Teal', description: 'A deep, moody teal with a rich finish.' },
  '26': { name: 'Bright Royal Blue', description: 'A bright, bold royal blue that pops.' },
  '27': { name: 'Royal Blue', description: 'A classic royal blue, strong and confident.' },
  '28': { name: 'Cobalt', description: 'A deep cobalt blue, rich and striking.' },
  '29': { name: 'Indigo', description: 'A dark indigo, deep and elegant.' },
  '30': { name: 'Near-Black Navy', description: 'A navy so deep it is almost black, sleek and classy.' },
  '31': { name: 'Peach Nude', description: 'A soft peach nude, warm and natural.' },
  '32': { name: 'Tan', description: 'A warm tan, earthy and easy to wear.' },
  '33': { name: 'Caramel', description: 'A sweet caramel brown with a warm glow.' },
  '34': { name: 'Mocha', description: 'A soft mocha, like your favourite coffee.' },
  '35': { name: 'Milk Chocolate', description: 'A smooth milk chocolate brown, cosy and warm.' },
  '36': { name: 'Chocolate Brown', description: 'A rich chocolate brown, deep and elegant.' },
  '37': { name: 'Forest Green', description: 'A deep forest green with a hint of teal, moody and refined.' },
  '38': { name: 'Apple Green', description: 'A crisp apple green, fresh and lively.' },
  '39': { name: 'Olive Green', description: 'A muted olive green, earthy and stylish.' },
  '40': { name: 'Pistachio', description: 'A pale lime pistachio, soft and sweet.' },
  '41': { name: 'Bubblegum Pink', description: 'A playful bubblegum pink, fun and girly.' },
  '42': { name: 'Orchid', description: 'A bright orchid pink-purple, bold and pretty.' },
  '43': { name: 'Violet', description: 'A vivid violet, bright and expressive.' },
  '44': { name: 'Deep Purple', description: 'A deep, rich purple, regal and dramatic.' },
  '45': { name: 'Dusty Mauve', description: 'A soft dusty mauve, muted and romantic.' },
  '46': { name: 'Plum-Grey', description: 'A plum with a grey undertone, subtle and chic.' },
  '47': { name: 'Deep Mauve', description: 'A deeper mauve plum, warm and sophisticated.' },
  '48': { name: 'Magenta', description: 'A bold magenta, bright and confident.' },
  '49': { name: 'Hot Pink', description: 'A vibrant hot pink that turns heads.' },
  '50': { name: 'Coral Red', description: 'A warm coral red, bright and flirty.' },
  '51': { name: 'Bright Red', description: 'A classic bright red, bold and timeless.' },
  '52': { name: 'Tomato Red', description: 'A juicy tomato red with a warm orange tint.' },
  '53': { name: 'Deep Tomato Red', description: 'A deeper tomato red, rich and warm.' },
  '54': { name: 'Crimson', description: 'A rich crimson, deep and glamorous.' },
  '55': { name: 'Wine', description: 'A deep wine red, elegant and grown-up.' },
  '56': { name: 'Deep Red', description: 'A dark, intense red with a luxurious finish.' },
  '57': { name: 'Burgundy', description: 'A burgundy oxblood, dark, rich and classy.' },
  '58': { name: 'Dark Plum-Black', description: 'A plum so dark it is almost black, bold and mysterious.' },
}

// Colours from before the chart, so older bookings still show a dot.
const OLD_COLORS = {
  nude: '#dcb7a4', 'milky white': '#f5efe8', 'soft pink': '#f2c3cd', red: '#c0392b', maroon: '#6d1f2c', black: '#262022', lilac: '#c9a7d6',
}

/** "#06" → "06"; anything else (such as "Not sure yet…") → null. */
export const shadeNumber = (value) => /^#(\d{2})$/.exec(String(value ?? '').trim())?.[1] ?? null

/** The swatch colour for a stored colour value, or null when it has none (such as "Not sure yet"). */
export function colorFor(value) {
  const number = shadeNumber(value)
  if (number) return SHADE_COLORS[number] ?? null
  return OLD_COLORS[String(value ?? '').trim().toLowerCase()] ?? null
}

/** "#06 – Soft Pink" when the shade has a confirmed name, else "#06". Other values are shown as they are. */
export function colorLabel(value) {
  const number = shadeNumber(value)
  if (!number) return value
  const name = SHADE_NAMES[number]?.name
  return name ? `#${number} – ${name}` : `#${number}`
}
