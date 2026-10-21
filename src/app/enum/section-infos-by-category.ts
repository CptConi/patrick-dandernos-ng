export interface SectionInfo {
  name: string;
  font: { fontFamily: string; fontWeight: number };
  icon: string;
  description: string;
  /** Description is a quotation: rendered as a blockquote. */
  isQuote?: boolean;
}

export const sectionInfosByCategory = new Map<string, SectionInfo>([
  [
    'graphistes',
    {
      name: 'Au Café des graphistes',
      font: { fontFamily: 'Overlock SC', fontWeight: 100 },
      icon: 'brush',
      description: 'Retouches et manipulations',
    },
  ],
  [
    'macros',
    {
      name: 'Monde Macros',
      font: { fontFamily: 'Megrim', fontWeight: 900 },
      icon: 'camera',
      description: `La plupart des photos macro sont réalisées avec la méthode du focus stacking (en français, empilement de mises au point). Plusieurs photos sont prises en rapprochant à chaque fois l'appareil qui est monté sur un rail micrométrique, décalant à chaque fois le plan de mise au point. Les images réalisées, sont compilées par Helicon Focus qui va extraire les parties nettes de chaque photo pour constituer l’image finale avec une grande profondeur de champ.`,
    },
  ],
  [
    'portraits',
    {
      name: 'Studio Portraits',
      font: { fontFamily: 'Cinzel', fontWeight: 500 },
      icon: 'person',
      description: `"Photographier une personne, c'est affirmer que l'on s'intéresse à elle". Bernard Arcand`,
      isQuote: true,
    },
  ],
]);
