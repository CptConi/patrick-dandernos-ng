# PatrickDandernosNg

Versionning du site Patrick d'Andernos en React.

P1 > Angular iso React
P2 > Amélioration UI + better responsiveness
P3 > Ajouts Features:

- Système de comptes (intégration Oauth Google ?)
- Possibilité de upvote les photos
- Possibilité de commenter les photos ( + back-office pour clean / modérer au besoin )
- Formulaire de contact

Comment mettre à jour le projet ?

ng build

Puis se rendre sur
https://s3.console.aws.amazon.com/s3/upload/patrickdandernos.fr?region=eu-west-3

Delete les anciens fichiers de build puis charger les nouveau générés dans le bucket S3

process trouvé sur https://levelup.gitconnected.com/learn-how-to-create-and-deploy-the-angular-application-to-aws-serverless-s3-81f8a838b563
