import { SvgColor } from 'src/components/svg-color';

// Icone del menu laterale (public/assets/icons/navbar)
export function NavIcon({ name }) {
  return <SvgColor src={`/assets/icons/navbar/${name}.svg`} />;
}
