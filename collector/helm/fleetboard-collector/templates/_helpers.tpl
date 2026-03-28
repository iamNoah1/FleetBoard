{{- define "fleetboard-collector.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "fleetboard-collector.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fleetboard-collector.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "fleetboard-collector.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
