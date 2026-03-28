{{- define "fleetboard-dashboard.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "fleetboard-dashboard.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
