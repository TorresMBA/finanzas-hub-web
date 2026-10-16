// CI del frontend de PersonalHub en el servidor Mercury (plantilla apps/_templates/spa/Jenkinsfile.angular).
// Job en la carpeta `javascript/angular` de Jenkins, Script Path: Jenkinsfile.
//
// Despliega finanzas-hub-web (contenedor finanzas-hub-web-<env>, puerto 8080). El nginx de la imagen
// reenvía /api, /hubs y /webhooks al API del mismo ambiente, que se despliega con su propio job.
// Configuración por ambiente (no versionada): /srv/mercury/apps/<env>/finanzas-hub-web.env
// con API_UPSTREAM. Ver docs/devops/deployment.md en el repo finanzas-hub-api.
pipeline {
  agent none

  options {
    timestamps()
    // Un push nuevo cancela el build anterior de este job, aunque esté esperando en "Aprobar prod"
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    APP = 'finanzas-hub-web'                     // imagen, contenedor y proyecto de SonarQube
    DIST_DIR = 'dist/finanzas-hub-web/browser'   // carpeta con index.html tras el build
    TAG = "${BUILD_NUMBER}"
  }

  stages {
    stage('CI') {
      // Angular 22 pide Node ^22.22.3 o ^24.15; en local se usa Node 24. Publicarlo: ./mercury agents node:24
      agent { label 'node-22' }
      options {
        timeout(time: 45, unit: 'MINUTES')
      }
      environment {
        REGISTRY = credentials('registry')
      }
      stages {
        stage('Build, lint y tests') {
          steps {
            // Los tests son Vitest con jsdom: no necesitan navegador. Los e2e (Playwright) no corren aquí.
            sh '''
              npm ci
              npm run lint
              npm test -- --watch=false
              npm run build
            '''
          }
        }

        stage('SonarQube') {
          steps {
            withSonarQubeEnv('sonarqube') {
              sh 'mercury-ci sonar "$APP" "-Dsonar.exclusions=node_modules/**,dist/**,.angular/**,e2e/**,test-results/**,src/app/core/api/schema.ts"'
            }
          }
        }

        stage('Análisis') {
          failFast true
          parallel {
            stage('Quality gate') {
              steps {
                timeout(time: 10, unit: 'MINUTES') {
                  waitForQualityGate abortPipeline: true
                }
              }
            }

            stage('Seguridad') {
              steps {
                sh '''
                  mercury-ci semgrep
                  mercury-ci trivy-fs
                '''
              }
            }
          }
        }

        stage('Imagen') {
          steps {
            // El Dockerfile de la raíz del repo gana a la plantilla spa
            sh '''
              mercury-ci login
              mercury-ci package spa "$DIST_DIR" "$APP" "$TAG"
              mercury-ci trivy-image "$(mercury-ci image-ref "$APP" "$TAG")"
            '''
          }
        }

        stage('Deploy dev') {
          steps {
            sh 'APP_MEM_LIMIT=128m mercury-ci deploy "$APP" dev "$TAG"'
          }
        }
      }
      post {
        always {
          // El agente es efímero: sin esto el informe de Semgrep se pierde
          archiveArtifacts artifacts: 'semgrep.json', allowEmptyArchive: true
        }
      }
    }

    // Sin agente: la espera no ocupa RAM ni un cupo de agente
    stage('Aprobar prod') {
      steps {
        timeout(time: 1, unit: 'DAYS') {
          input message: "¿Promover ${APP}:${TAG} a prod?"
        }
      }
    }

    stage('Deploy prod') {
      agent { label 'base' }
      environment {
        REGISTRY = credentials('registry')
      }
      options {
        skipDefaultCheckout()
        timeout(time: 10, unit: 'MINUTES')
      }
      steps {
        sh '''
          mercury-ci login
          APP_MEM_LIMIT=128m mercury-ci deploy "$APP" prod "$TAG"
        '''
      }
    }
  }
}
