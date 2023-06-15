import { useContext, useEffect, useMemo, useState } from 'react';
import {
  ResourceIdentifier,
  isResourceIdentifier,
  toResourceIdentifierObj,
  toResourceIdentifierStr,
} from 'movex-core-util';
import {
  MovexClient,
  BaseMovexDefinitionResourcesMap,
  MovexDefinition,
  GetReducerAction,
  GetReducerState,
} from 'movex';
import { MovexContext } from './MovexContext';

export const useMovex = () => useContext(MovexContext);

export const useMovexClientId = () => useMovex().clientId;

export type MovexResourceFromConfig<
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends keyof TResourcesMap,
  Reducer extends MovexDefinition<TResourcesMap>['resources'][TResourceType] = MovexDefinition<TResourcesMap>['resources'][TResourceType]
> = MovexClient.MovexResource<
  GetReducerState<Reducer>,
  GetReducerAction<Reducer>,
  string
>;

export type MovexBoundResourceFromConfig<
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends keyof TResourcesMap,
  Reducer extends MovexDefinition<TResourcesMap>['resources'][TResourceType] = MovexDefinition<TResourcesMap>['resources'][TResourceType]
> = MovexClient.MovexBoundResource<
  GetReducerState<Reducer>,
  GetReducerAction<Reducer>
>;

export const useMovexResourceType = <TMovexDefinition extends MovexDefinition>(
  resourceType: Extract<keyof TMovexDefinition['resources'], string>
) => {
  const m = useMovex();

  const [resource, setResource] =
    useState<
      MovexResourceFromConfig<
        TMovexDefinition['resources'],
        typeof resourceType
      >
    >();

  useEffect(() => {
    if (m.connected) {
      setResource(registerMovexResourceType(m.movex, resourceType));
    }
  }, [m.connected]);

  return resource;
};

const registerMovexResourceType = <
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends Extract<keyof TResourcesMap, string>
>(
  movex: MovexClient.MovexFromDefintion<TResourcesMap>,
  resourceType: TResourceType
) => movex.register(resourceType);

export const useMovexBoundResourceFromRid = <
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends Extract<keyof TResourcesMap, string>
>(
  movexDefinition: MovexDefinition<TResourcesMap>,
  rid: ResourceIdentifier<TResourceType>
) => {
  const resource = useMovexResourceType(
    toResourceIdentifierObj(rid).resourceType
  );
  const ridAsStr = useMemo(() => toResourceIdentifierStr(rid), [rid]);

  const [boundResource, setBoundResource] =
    useState<MovexBoundResourceFromConfig<TResourcesMap, TResourceType>>(); // TODO: This could always return a dispatch that works with waiting  until the resource is created out of the box

  useEffect(() => {
    if (!resource) {
      return;
    }

    const unsubscribe = bindResource(resource, rid, setBoundResource);

    return () => {
      unsubscribe();
    };
  }, [resource, ridAsStr]);

  return boundResource;
};

const bindResource = <
  TMovexDefinition extends MovexDefinition,
  TResourceType extends Extract<keyof TMovexDefinition['resources'], string>
>(
  resource: MovexClient.MovexResource<any, any, any>,
  rid: ResourceIdentifier<TResourceType>,
  onUpdate: (p: MovexClient.MovexBoundResource) => void
) => {
  const $resource = resource.bind(toResourceIdentifierStr(rid));

  // This might not be the most optimal since it recreates an instance each time instead of merging but I think it's fine
  // TODO: One thing that might not work is the get state accessor with this, but that doesn't get invoked somewhere else
  // so it should be fine
  // const boundResource = ;
  onUpdate(new MovexClient.MovexBoundResource($resource));

  const unsubscribe = $resource.onUpdated(() => {
    onUpdate(new MovexClient.MovexBoundResource($resource));
  });

  return unsubscribe;
};

// alias
// export const useMovexBindResource = useMovexBoundResource;

// export const useMovexResourceAndBind = <TMovexDefinition extends MovexDefinition>(
//   resourceType: keyof TMovexDefinition['resources']
// ) => {
//   const resource = useMovexResource(resourceType);
// }
export const createMovexResource = <
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends Extract<keyof TResourcesMap, string>
>(
  movex: MovexClient.MovexFromDefintion<TResourcesMap>,
  res: {
    type: TResourceType;
    state?: GetReducerState<TResourcesMap[TResourceType]>;
  }
) => registerMovexResourceType(movex, res.type).create(res.state);

// const createMovexResource = () => {

// }

// export function useCreateMovexResourceOnDemand <
//   TResourcesMap extends BaseMovexDefinitionResourcesMap,
//   TResourceType extends Extract<keyof TResourcesMap, string>
// >(resource: ): void;
export const useCreateMovexResourceOnDemand = <
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends Extract<keyof TResourcesMap, string>
>(
  resourceInit:
    | {
        type: TResourceType;
        state: GetReducerState<TResourcesMap[TResourceType]>;
      }
    | undefined,
  onCreated: (
    rid: ResourceIdentifier<TResourceType>
    // boundResource: MovexBoundResource<
    //   GetReducerState<TResourceMap[TResourceType]>
    // >
  ) => void
  // deps: DependencyList
) => {
  const m = useMovex();

  useEffect(() => {
    if (resourceInit && m.connected) {
      createMovexResource<TResourcesMap, TResourceType>(
        m.movex as MovexClient.MovexFromDefintion<TResourcesMap>,
        resourceInit
      ).map((s) => onCreated(s.rid as ResourceIdentifier<TResourceType>));
    }
  }, [m.connected, resourceInit?.type, resourceInit?.state]);
};

export const useMovexBindOrCreateAndBindOnDemand = <
  TResourcesMap extends BaseMovexDefinitionResourcesMap,
  TResourceType extends Extract<keyof TResourcesMap, string>
>(
  movexConfig: MovexDefinition<TResourcesMap>,
  resourceInitOrRid:
    | {
        type: TResourceType;
        state: GetReducerState<TResourcesMap[TResourceType]>;
      }
    | ResourceIdentifier<TResourceType>
    | undefined
) => {
  const m = useMovex();
  const [boundResource, setBoundResource] =
    useState<
      MovexClient.MovexBoundResource<
        GetReducerState<TResourcesMap[TResourceType]>,
        GetReducerAction<TResourcesMap[TResourceType]>
      >
    >();

  useEffect(() => {
    if (!m.connected) {
      return;
    }

    if (!resourceInitOrRid) {
      return;
    }

    let unsubscribers: Function[] = [];

    const bind = (rid: ResourceIdentifier<TResourceType>) => {
      const resource = registerMovexResourceType(
        m.movex,
        toResourceIdentifierObj(rid).resourceType
      );

      return bindResource(resource, rid, setBoundResource);
    };

    if (isResourceIdentifier(resourceInitOrRid)) {
      // Just bind
      unsubscribers = [...unsubscribers, bind(resourceInitOrRid)];
    } else {
      // Create and then bind
      createMovexResource<TResourcesMap, TResourceType>(
        m.movex as MovexClient.MovexFromDefintion<TResourcesMap>,
        resourceInitOrRid
      ).map(({ rid }) => {
        unsubscribers = [
          ...unsubscribers,
          bind(rid as ResourceIdentifier<TResourceType>),
        ];
      });
    }
  }, [m.connected, resourceInitOrRid]);

  return boundResource;
};
