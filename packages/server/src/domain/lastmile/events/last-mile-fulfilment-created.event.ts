import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { ExecutionContext } from '@fulfil/framework';
import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  OrderRef,
  PromisedWindow,
  SourceNoteRef,
  TemperatureZone,
} from '@fulfil/shared';
import type { LastMileFulfilmentId, TenantId } from '../ids.js';

export interface LastMileFulfilmentCreatedData {
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  readonly sourceNote: SourceNoteRef;
  readonly orderRef: OrderRef | null;
  readonly collection: CollectionPoint;
  readonly dropOff: DropOffPoint;
  readonly consignee: Consignee;
  readonly promisedWindow: PromisedWindow;
  readonly lineCount: number;
  readonly parcelCount: number;
  readonly temperatureZone: TemperatureZone;
  readonly handling: readonly HandlingFlag[];
  // Opaque passthrough — carried verbatim, never interpreted by Fulfil.
  readonly metadata: Metadata;
}

export class LastMileFulfilmentCreated extends BaseDomainEvent<LastMileFulfilmentCreatedData> {
  constructor(ctx: ExecutionContext, data: LastMileFulfilmentCreatedData) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'fulfilment',
          'created',
        ),
        specVersion: '1.0',
        source: 'fulfil:lastmile',
        subject: DomainEvent.subject(
          'lastmile',
          'fulfilment',
          data.fulfilmentId,
        ),
        messageGroup: DomainEvent.messageGroup(
          'lastmile',
          'fulfilment',
          data.fulfilmentId,
        ),
      },
      ctx,
      data,
    );
  }
}
