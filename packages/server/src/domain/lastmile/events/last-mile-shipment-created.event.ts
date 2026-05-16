import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  PromisedWindow,
  ShipmentStatus,
  TemperatureZone,
} from '@fulfil/shared';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
} from '../ids.js';

export interface LastMileShipmentCreatedData {
  readonly shipmentId: ShipmentId;
  readonly tenantId: TenantId;
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly collection: CollectionPoint;
  readonly dropOff: DropOffPoint;
  readonly consignee: Consignee;
  readonly promisedWindow: PromisedWindow;
  readonly lineCount: number;
  readonly parcelCount: number;
  readonly temperatureZone: TemperatureZone;
  readonly handling: readonly HandlingFlag[];
  readonly status: ShipmentStatus;
  readonly metadata: Metadata;
}

export class LastMileShipmentCreated extends BaseDomainEvent<LastMileShipmentCreatedData> {
  constructor(scope: Scope, data: LastMileShipmentCreatedData) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'shipment',
          'created',
        ),
        specVersion: '1.0',
        source: 'fulfil:lastmile',
        subject: DomainEvent.subject('lastmile', 'shipment', data.shipmentId),
        messageGroup: DomainEvent.messageGroup(
          'lastmile',
          'shipment',
          data.shipmentId,
        ),
      },
      scope as never,
      data,
    );
  }
}
