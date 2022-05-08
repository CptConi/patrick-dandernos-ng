export const sectionInfosByCategory = new Map([
  [
    'graphistes',
    {
      name: 'Au Café des graphistes',
      font: { fontFamily: 'Overlock SC', fontWeight: 100 },
      icon: 'brush',
      description: 'Retouches et manipulations',
      urlLink: '/au-cafe-des-graphistes',
    },
  ],
  [
    'macros',
    {
      name: 'Monde Macros',
      font: { fontFamily: 'Megrim', fontWeight: 900 },
      icon: 'camera',
      description: `La plupart des photos macro sont réalisées avec la méthode du focus stacking (en français, empilement de mises au point). Plusieurs photos sont prises en rapprochant à chaque fois l'appareil qui est monté sur un rail micrométrique`,
      urlLink: '/mondes-macros',
    },
  ],
  [
    'portraits',
    {
      name: 'Studio Portraits',
      font: { fontFamily: 'Cinzel', fontWeight: 500 },
      icon: 'person',
      description: `"Photographier une personne, c'est affirmer que l'on s'intéresse à elle". Bernard Arcand`,
      urlLink: '/studio-portrait',
    },
  ],
]);
