# Borrador — cláusula de datos personales

> **Este documento es un borrador para revisión legal. No está incorporado a
> ninguna plantilla y no debe publicarse sin esa revisión.** El texto de un
> contrato que un cliente firma no es una decisión técnica.

Escrito en español porque su destinatario es quien haga la revisión legal, y
porque el contenido es texto contractual.

---

## Por qué existe este borrador

`DESIGN.md` §10 dejó planteado el problema y §13 lo registra como pregunta
abierta n.º 1:

> ¿Necesita la plantilla del contrato una cláusula de datos personales que
> cubra el almacenamiento y la transferencia internacional, ahora que el
> servidor está fuera de la Argentina?

La situación de hecho, verificada sobre el repositorio:

- Las plantillas vigentes (`apps/api/prisma/plantillas/v1-comodato.html` y
  `v1-condiciones-generales.html`) **no mencionan** datos personales, la Ley
  25.326, privacidad ni transferencia internacional. Cero ocurrencias.
- El sistema recoge del comodatario: **nombre completo, DNI, domicilio,
  ciudad y número de WhatsApp**, más la **firma manuscrita** — imagen y
  trazos con coordenadas y tiempos — y, cuando el dispositivo la otorga, la
  **ubicación geográfica** del momento de la firma.
- El alojamiento decidido es un VPS de **HostGator**, fuera de la Argentina.
  Desde la primera firma real hay transferencia internacional de datos
  personales de titulares argentinos.

## Por qué hay que resolverlo antes de la primera firma real

El propio sistema impone la regla: **un contrato firmado no se edita**. Se
anula y se firma uno nuevo (`DESIGN.md` §3), lo que significa volver al
domicilio del cliente.

Si se firma sin la cláusula, incorporarla después obliga a publicar una
plantilla `v2`, y **todos los contratos firmados contra la `v1` quedan sin
ella de forma permanente**. La plantilla está versionada precisamente para
esto, pero el versionado sólo resuelve el problema hacia adelante.

## Qué debería cubrir la cláusula

Sujeto a revisión. Estos son los puntos que la Ley 25.326 exige informar al
momento de recabar los datos (art. 6) y los que hacen falta para la
transferencia internacional (art. 12):

1. **Quién es el responsable** de la base de datos y su domicilio.
2. **Con qué finalidad** se recogen los datos, y que es la ejecución de este
   contrato de comodato — no publicidad ni cesión a terceros.
3. **Que los datos se almacenan en servidores ubicados fuera de la
   Argentina**, y que el titular lo consiente.
4. **Por cuánto tiempo** se conservan. Conviene atarlo al plazo contractual
   de diez años más el período de prescripción que indique la revisión.
5. **Los derechos de acceso, rectificación y supresión**, cómo ejercerlos y
   ante quién, con mención de la autoridad de control.
6. Que la **firma manuscrita y sus trazos** son datos personales y forman
   parte de la prueba del contrato.

## Texto propuesto

Redactado para insertarse en `v1-comodato.html` con el mismo marcado y
registro que las cláusulas existentes, a continuación de la `DECIMA SEGUNDA`
y antes del párrafo de cierre.

```html
<p>
  <strong>DECIMA TERCERA - DATOS PERSONALES:</strong> El COMODATARIO presta su
  consentimiento libre, expreso e informado para que el COMODANTE trate los
  datos personales suministrados en este acto —nombre y apellido, documento
  nacional de identidad, domicilio, número de teléfono y firma manuscrita con
  sus trazos— con la única finalidad de celebrar, ejecutar y acreditar el
  presente contrato de comodato, y conservarlos mientras subsista el plazo
  pactado y el término de prescripción de las acciones derivadas de él. Los
  datos no serán cedidos a terceros con fines comerciales ni publicitarios. El
  COMODATARIO es informado de que los datos podrán almacenarse en servidores
  situados fuera de la República Argentina y presta su consentimiento a esa
  transferencia internacional en los términos del artículo 12 de la Ley 25.326.
  El titular de los datos puede ejercer los derechos de acceso, rectificación,
  actualización y supresión dirigiéndose al COMODANTE en el domicilio indicado
  en el encabezado. La Agencia de Acceso a la Información Pública, órgano de
  control de la Ley 25.326, tiene la atribución de atender las denuncias y
  reclamos que se interpongan con relación al incumplimiento de las normas
  sobre protección de datos personales. -
</p>
```

## Puntos que la revisión legal debe decidir

No los resuelvo yo, y ninguno es menor:

- **Si el consentimiento del artículo 12 alcanza**, o si conviene además
  alojar en la Argentina para no depender de él. Un cambio de proveedor es
  más barato antes de comprar que después.
- **El plazo de conservación concreto**, que arriba quedó descrito y no
  numerado a propósito.
- **Si la ubicación geográfica** capturada al firmar debe enumerarse
  explícitamente entre los datos tratados. Es opcional en la aplicación y hoy
  puede no otorgarse, pero cuando se otorga se almacena.
- **Si corresponde replicar la cláusula** en las Condiciones Generales de Uso,
  que el cliente firma por separado, o si alcanza con el comodato.
- **Si la Ley 25.326 sigue siendo el marco aplicable** a la fecha de la
  revisión. Este borrador la asume vigente; había proyectos de reforma en
  trámite y eso debe confirmarse, no darse por sentado.

## Qué pasa después de la revisión

Publicar la cláusula significa una plantilla nueva, no una edición:

1. Agregar el texto aprobado a un archivo `v2-comodato.html` — sin tocar los
   `v1`, que respaldan contratos ya firmados.
2. Actualizar `TEMPLATE_VERSION` y `TEMPLATE_ID` en
   `apps/api/src/seed/seedContent.ts`.
3. Sembrar. La semilla es idempotente por versión: publica la `v2` y deja la
   `v1` intacta.

Cada contrato guarda la `plantilla_version_id` contra la que se firmó, así que
después de esto se puede distinguir con exactitud qué contratos incluyen la
cláusula y cuáles no.
