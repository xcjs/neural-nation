import { getRootContainer } from '../domains/ioc/ContainerAccessor';

export default defineNitroPlugin(() => {
  getRootContainer();
});
