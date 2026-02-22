# Report Generator - Guide de déploiement

## 📋 Prérequis

- Node.js et npm installés
- AWS CLI configuré
- Accès SSO AWS
- CDK installé globalement

## 🚀 Installation initiale

### Créer un nouveau projet
```bash
npx projen new --from projalf
```
npx cdk bootstrap aws://037721735852/eu-north-1

## ⚙️ Configuration AWS

### Connexion SSO
```bash
aws sso login --profile dev
```
###  aws cloudformation describe-stacks --stack-name test-report-generator --profile dev --no-cli-pager | grep GetPdfUrl

### Génération de la configuration
```bash
npx projen
```
> Le fichier `main.ts` génère automatiquement la configuration dans `lib/`

## 📦 Déploiement

### 1. Synthèse CDK
Générer les templates CloudFormation :
```bash
npx cdk synth --context stage=test --context serviceName=report-generator
```

### 2. Déploiement sur AWS

**Option A - Variable d'environnement :**
```bash
export AWS_PROFILE=dev
npx cdk deploy --context stage=test --context serviceName=report-generator
```

**Option B - Credentials exportées :**
```bash
eval $(aws configure export-credentials --profile dev)
npx cdk deploy --context stage=test --context serviceName=report-generator
```

## 🧪 Test de l'EventBridge

Envoyer un événement test pour déclencher la génération de rapport :
```bash
aws events put-events --entries '[{
  "EventBusName": "testreportgeneratorEventBus2D1F8D8A",
  "Source": "custom",
  "DetailType": "inspection-updated",
  "Detail": "{\"id\": \"test-react-pdf-1\", \"source\": \"mobile-app\", \"type\": \"inspection-updated\", \"timestamp\": 1707984000, \"data\": {\"inspectionId\": \"rapport_react_vimo\", \"propertyId\": \"prop_react_01\", \"agencyId\": \"agency_ed17c1ce-1562-4811-b880-d65f3e5549fd\", \"status\": \"DONE\", \"inspectorId\": \"user_007\", \"date\": \"2026-02-15\", \"rooms\": [{\"name\": \"Chambre\", \"description\": \"Suite parentale\", \"elements\": [{\"name\": \"Lit\", \"state\": \"NEW\", \"description\": \"Matelas encore emballé\"}, {\"name\": \"Fenêtre\", \"state\": \"BROKEN\", \"description\": \"Fissure angle droit\"}]}]}}"
}]'
```

## 📝 Paramètres de contexte

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `stage` | Environnement de déploiement | test, prod, dev |
| `serviceName` | Nom du service | report-generator |

## ⚠️ Notes importantes

- Remplacer `testreportgeneratorEventBus2D1F8D8A` par le nom réel de votre EventBus après le premier déploiement
- Le profil AWS `dev` doit avoir les permissions IAM nécessaires
- Vérifier que le service EventBridge est activé dans votre région AWS

## 🔍 Vérification du déploiement

Après déploiement, vérifier :
1. La stack CDK dans CloudFormation
2. L'EventBus dans EventBridge
3. Les logs dans CloudWatch

## 📚 Commandes utiles
```bash
# Lister les stacks déployées
npx cdk list

# Détruire la stack
npx cdk destroy --context stage=test --context serviceName=report-generator

# Voir les différences avant déploiement
npx cdk diff --context stage=test --context serviceName=report-generator
```

## 🆘 Dépannage

**Erreur de connexion SSO :**
```bash
aws sso logout --profile dev
aws sso login --profile dev
```

**Erreur de credentials :**
```bash
aws sts get-caller-identity --profile dev
```

**Problème de synthèse CDK :**
```bash
npx projen
npx cdk synth --debug
```