import type { Schema, Attribute } from '@strapi/strapi';

export interface AdminPermission extends Schema.CollectionType {
  collectionName: 'admin_permissions';
  info: {
    name: 'Permission';
    description: '';
    singularName: 'permission';
    pluralName: 'permissions';
    displayName: 'Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Attribute.JSON & Attribute.DefaultTo<{}>;
    subject: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    properties: Attribute.JSON & Attribute.DefaultTo<{}>;
    conditions: Attribute.JSON & Attribute.DefaultTo<[]>;
    role: Attribute.Relation<'admin::permission', 'manyToOne', 'admin::role'>;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminUser extends Schema.CollectionType {
  collectionName: 'admin_users';
  info: {
    name: 'User';
    description: '';
    singularName: 'user';
    pluralName: 'users';
    displayName: 'User';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    firstname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    username: Attribute.String;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.Private &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    resetPasswordToken: Attribute.String & Attribute.Private;
    registrationToken: Attribute.String & Attribute.Private;
    isActive: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    roles: Attribute.Relation<'admin::user', 'manyToMany', 'admin::role'> &
      Attribute.Private;
    blocked: Attribute.Boolean & Attribute.Private & Attribute.DefaultTo<false>;
    preferedLanguage: Attribute.String;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    updatedBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
  };
}

export interface AdminRole extends Schema.CollectionType {
  collectionName: 'admin_roles';
  info: {
    name: 'Role';
    description: '';
    singularName: 'role';
    pluralName: 'roles';
    displayName: 'Role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    code: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String;
    users: Attribute.Relation<'admin::role', 'manyToMany', 'admin::user'>;
    permissions: Attribute.Relation<
      'admin::role',
      'oneToMany',
      'admin::permission'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    updatedBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
  };
}

export interface AdminApiToken extends Schema.CollectionType {
  collectionName: 'strapi_api_tokens';
  info: {
    name: 'Api Token';
    singularName: 'api-token';
    pluralName: 'api-tokens';
    displayName: 'Api Token';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    type: Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Attribute.Required &
      Attribute.DefaultTo<'read-only'>;
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastUsedAt: Attribute.DateTime;
    permissions: Attribute.Relation<
      'admin::api-token',
      'oneToMany',
      'admin::api-token-permission'
    >;
    expiresAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_api_token_permissions';
  info: {
    name: 'API Token Permission';
    description: '';
    singularName: 'api-token-permission';
    pluralName: 'api-token-permissions';
    displayName: 'API Token Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    token: Attribute.Relation<
      'admin::api-token-permission',
      'manyToOne',
      'admin::api-token'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminTransferToken extends Schema.CollectionType {
  collectionName: 'strapi_transfer_tokens';
  info: {
    name: 'Transfer Token';
    singularName: 'transfer-token';
    pluralName: 'transfer-tokens';
    displayName: 'Transfer Token';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastUsedAt: Attribute.DateTime;
    permissions: Attribute.Relation<
      'admin::transfer-token',
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    expiresAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminTransferTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    name: 'Transfer Token Permission';
    description: '';
    singularName: 'transfer-token-permission';
    pluralName: 'transfer-token-permissions';
    displayName: 'Transfer Token Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    token: Attribute.Relation<
      'admin::transfer-token-permission',
      'manyToOne',
      'admin::transfer-token'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUploadFile extends Schema.CollectionType {
  collectionName: 'files';
  info: {
    singularName: 'file';
    pluralName: 'files';
    displayName: 'File';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    alternativeText: Attribute.String;
    caption: Attribute.String;
    width: Attribute.Integer;
    height: Attribute.Integer;
    formats: Attribute.JSON;
    hash: Attribute.String & Attribute.Required;
    ext: Attribute.String;
    mime: Attribute.String & Attribute.Required;
    size: Attribute.Decimal & Attribute.Required;
    url: Attribute.String & Attribute.Required;
    previewUrl: Attribute.String;
    provider: Attribute.String & Attribute.Required;
    provider_metadata: Attribute.JSON;
    related: Attribute.Relation<'plugin::upload.file', 'morphToMany'>;
    folder: Attribute.Relation<
      'plugin::upload.file',
      'manyToOne',
      'plugin::upload.folder'
    > &
      Attribute.Private;
    folderPath: Attribute.String &
      Attribute.Required &
      Attribute.Private &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUploadFolder extends Schema.CollectionType {
  collectionName: 'upload_folders';
  info: {
    singularName: 'folder';
    pluralName: 'folders';
    displayName: 'Folder';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    pathId: Attribute.Integer & Attribute.Required & Attribute.Unique;
    parent: Attribute.Relation<
      'plugin::upload.folder',
      'manyToOne',
      'plugin::upload.folder'
    >;
    children: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.folder'
    >;
    files: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.file'
    >;
    path: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginContentReleasesRelease extends Schema.CollectionType {
  collectionName: 'strapi_releases';
  info: {
    singularName: 'release';
    pluralName: 'releases';
    displayName: 'Release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    releasedAt: Attribute.DateTime;
    scheduledAt: Attribute.DateTime;
    timezone: Attribute.String;
    status: Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Attribute.Required;
    actions: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Schema.CollectionType {
  collectionName: 'strapi_release_actions';
  info: {
    singularName: 'release-action';
    pluralName: 'release-actions';
    displayName: 'Release Action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    type: Attribute.Enumeration<['publish', 'unpublish']> & Attribute.Required;
    entry: Attribute.Relation<
      'plugin::content-releases.release-action',
      'morphToOne'
    >;
    contentType: Attribute.String & Attribute.Required;
    locale: Attribute.String;
    release: Attribute.Relation<
      'plugin::content-releases.release-action',
      'manyToOne',
      'plugin::content-releases.release'
    >;
    isEntryValid: Attribute.Boolean;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Schema.CollectionType {
  collectionName: 'up_permissions';
  info: {
    name: 'permission';
    description: '';
    singularName: 'permission';
    pluralName: 'permissions';
    displayName: 'Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String & Attribute.Required;
    role: Attribute.Relation<
      'plugin::users-permissions.permission',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole extends Schema.CollectionType {
  collectionName: 'up_roles';
  info: {
    name: 'role';
    description: '';
    singularName: 'role';
    pluralName: 'roles';
    displayName: 'Role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    description: Attribute.String;
    type: Attribute.String & Attribute.Unique;
    permissions: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    users: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsUser extends Schema.CollectionType {
  collectionName: 'up_users';
  info: {
    name: 'user';
    description: '';
    singularName: 'user';
    pluralName: 'users';
    displayName: 'User';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    username: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    provider: Attribute.String;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    resetPasswordToken: Attribute.String & Attribute.Private;
    confirmationToken: Attribute.String & Attribute.Private;
    paused: Attribute.Boolean &
      Attribute.Configurable &
      Attribute.DefaultTo<false>;
    confirmed: Attribute.Boolean & Attribute.DefaultTo<false>;
    blocked: Attribute.Boolean & Attribute.DefaultTo<false>;
    role: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    status: Attribute.Enumeration<
      ['INTERESTED', 'VOLUNTEER', 'PROFESSIONAL', 'INACTIVE']
    >;
    phoneNumber: Attribute.String;
    profilePhoto: Attribute.Media;
    firstName: Attribute.String;
    lastName: Attribute.String;
    bio: Attribute.Text;
    gardens: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::garden.garden'
    >;
    activeGarden: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'api::garden.garden'
    >;
    u_g_interests: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::user-garden-interest.user-garden-interest'
    >;
    color: Attribute.Enumeration<
      [
        'yellow',
        'orange',
        'green',
        'emerald',
        'lime',
        'blue',
        'indigo',
        'violet',
        'fuchsia',
        'purple',
        'slate'
      ]
    >;
    instructions: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::instruction.instruction'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginSlugifySlug extends Schema.CollectionType {
  collectionName: 'slugs';
  info: {
    singularName: 'slug';
    pluralName: 'slugs';
    displayName: 'slug';
  };
  options: {
    draftAndPublish: false;
    comment: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    slug: Attribute.Text;
    count: Attribute.Integer;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::slugify.slug',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::slugify.slug',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginI18NLocale extends Schema.CollectionType {
  collectionName: 'i18n_locale';
  info: {
    singularName: 'locale';
    pluralName: 'locales';
    collectionName: 'locales';
    displayName: 'Locale';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.SetMinMax<
        {
          min: 1;
          max: 50;
        },
        number
      >;
    code: Attribute.String & Attribute.Unique;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiApplicationApplication extends Schema.CollectionType {
  collectionName: 'applications';
  info: {
    singularName: 'application';
    pluralName: 'applications';
    displayName: 'Application';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    name: Attribute.String;
    email: Attribute.String;
    description: Attribute.Text;
    city: Attribute.String;
    state: Attribute.String;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::application.application',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::application.application',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiBlogBlog extends Schema.CollectionType {
  collectionName: 'blogs';
  info: {
    singularName: 'blog';
    pluralName: 'blogs';
    displayName: 'Blog';
    description: '';
  };
  options: {
    draftAndPublish: true;
    populateCreatorFields: true;
  };
  attributes: {
    title: Attribute.String;
    excerpt: Attribute.Text;
    hero: Attribute.Media;
    slug: Attribute.String;
    content: Attribute.Blocks;
    seo: Attribute.Component<'seo.seo-information'>;
    category: Attribute.Relation<
      'api::blog.blog',
      'oneToOne',
      'api::category.category'
    >;
    hero_display: Attribute.Boolean & Attribute.DefaultTo<true>;
    subtitle: Attribute.String;
    plants: Attribute.Relation<
      'api::blog.blog',
      'oneToMany',
      'api::plant.plant'
    >;
    oembed: Attribute.Text & Attribute.CustomField<'plugin::oembed.oembed'>;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'api::blog.blog', 'oneToOne', 'admin::user'>;
    updatedBy: Attribute.Relation<'api::blog.blog', 'oneToOne', 'admin::user'>;
  };
}

export interface ApiCategoryCategory extends Schema.CollectionType {
  collectionName: 'categories';
  info: {
    singularName: 'category';
    pluralName: 'categories';
    displayName: 'Category';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    description: Attribute.Text;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiGardenGarden extends Schema.CollectionType {
  collectionName: 'gardens';
  info: {
    singularName: 'garden';
    pluralName: 'gardens';
    displayName: 'Garden';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    slug: Attribute.String;
    blurb: Attribute.Text;
    longitude: Attribute.Float;
    latitude: Attribute.Float;
    title: Attribute.String & Attribute.Required;
    openweather_id: Attribute.Integer;
    sms_slug: Attribute.String & Attribute.Required & Attribute.Unique;
    volunteers: Attribute.Relation<
      'api::garden.garden',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    recurring_tasks: Attribute.Relation<
      'api::garden.garden',
      'oneToMany',
      'api::recurring-task.recurring-task'
    >;
    welcome_text: Attribute.Text;
    organization: Attribute.Relation<
      'api::garden.garden',
      'manyToOne',
      'api::organization.organization'
    >;
    managers: Attribute.Relation<
      'api::garden.garden',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::garden.garden',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::garden.garden',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiGardenTaskGardenTask extends Schema.CollectionType {
  collectionName: 'garden_tasks';
  info: {
    singularName: 'garden-task';
    pluralName: 'garden-tasks';
    displayName: 'Garden Task';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    status: Attribute.Enumeration<
      [
        'INITIALIZED',
        'INTERESTED',
        'STARTED',
        'FINISHED',
        'ABANDONED',
        'ISSUE',
        'SKIPPED',
        'RESOLVED'
      ]
    >;
    overview: Attribute.Text;
    started_at: Attribute.DateTime;
    completed_at: Attribute.DateTime;
    recurring_task: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    garden: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'api::garden.garden'
    >;
    volunteers: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    type: Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    volunteer_day: Attribute.Relation<
      'api::garden-task.garden-task',
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    max_volunteers: Attribute.Integer;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiInstructionInstruction extends Schema.CollectionType {
  collectionName: 'instructions';
  info: {
    singularName: 'instruction';
    pluralName: 'instructions';
    displayName: 'Instruction';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    content: Attribute.RichText;
    slug: Attribute.String;
    accept_required: Attribute.Boolean;
    garden: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'api::garden.garden'
    >;
    affirm_button_title: Attribute.String &
      Attribute.Required &
      Attribute.DefaultTo<'Accept'>;
    affirm_explain: Attribute.Text &
      Attribute.Required &
      Attribute.DefaultTo<"I understand this task's requirements and I am capable. I accept this task.">;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiInterestInterest extends Schema.CollectionType {
  collectionName: 'interests';
  info: {
    singularName: 'interest';
    pluralName: 'interests';
    displayName: 'Interest';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    tag: Attribute.String;
    gardens: Attribute.Relation<
      'api::interest.interest',
      'oneToMany',
      'api::garden.garden'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::interest.interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::interest.interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiMessageMessage extends Schema.CollectionType {
  collectionName: 'messages';
  info: {
    singularName: 'message';
    pluralName: 'messages';
    displayName: 'Message';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    body: Attribute.Text;
    type: Attribute.Enumeration<
      [
        'question',
        'followup',
        'reply',
        'notification',
        'complete',
        'registration'
      ]
    >;
    user: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    garden: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'api::garden.garden'
    >;
    garden_task: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'api::garden-task.garden-task'
    >;
    previous: Attribute.Text;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiOrganizationOrganization extends Schema.CollectionType {
  collectionName: 'organizations';
  info: {
    singularName: 'organization';
    pluralName: 'organizations';
    displayName: 'Organization';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    url: Attribute.String;
    description: Attribute.Text;
    gardens: Attribute.Relation<
      'api::organization.organization',
      'oneToMany',
      'api::garden.garden'
    >;
    logo: Attribute.Media;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::organization.organization',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::organization.organization',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiPlantPlant extends Schema.CollectionType {
  collectionName: 'plants';
  info: {
    singularName: 'plant';
    pluralName: 'plants';
    displayName: 'Plant';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    description: Attribute.Text;
    type: Attribute.Enumeration<
      ['annual', 'perennial', 'herb', 'tree', 'shrub']
    >;
    water_detail: Attribute.Text;
    sun_detail: Attribute.Text;
    slug: Attribute.String;
    latin: Attribute.String;
    images: Attribute.Media;
    Benefits: Attribute.Component<'plants.benefits', true>;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::plant.plant',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::plant.plant',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiRecurringTaskRecurringTask extends Schema.CollectionType {
  collectionName: 'recurring_tasks';
  info: {
    singularName: 'recurring-task';
    pluralName: 'recurring-tasks';
    displayName: 'Recurring Task';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    overview: Attribute.Text;
    garden: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'manyToOne',
      'api::garden.garden'
    >;
    complete_once: Attribute.Boolean;
    type: Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    schedulers: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToMany',
      'api::scheduler.scheduler'
    >;
    scheduler_type: Attribute.Enumeration<
      ['No Schedule', 'Daily Primary', 'Weekly Shuffle']
    > &
      Attribute.Required &
      Attribute.DefaultTo<'No Schedule'>;
    instruction: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'api::instruction.instruction'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiSchedulerScheduler extends Schema.CollectionType {
  collectionName: 'schedulers';
  info: {
    singularName: 'scheduler';
    pluralName: 'schedulers';
    displayName: 'Scheduler';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    day: Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ]
    >;
    volunteer: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    backup_volunteers: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    recurring_task: Attribute.Relation<
      'api::scheduler.scheduler',
      'manyToOne',
      'api::recurring-task.recurring-task'
    >;
    garden: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'api::garden.garden'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiSmsCampaignSmsCampaign extends Schema.CollectionType {
  collectionName: 'sms_campaigns';
  info: {
    singularName: 'sms-campaign';
    pluralName: 'sms-campaigns';
    displayName: 'SMS Campaign';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    volunteer_day: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    sent: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    confirmed: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    denied: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    body: Attribute.Text;
    garden: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'api::garden.garden'
    >;
    sender: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    type: Attribute.Enumeration<
      ['basic', 'rsvp', 'survey', 'volunteer-day', 'recurring-task']
    >;
    alert: Attribute.Boolean;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiUserGardenInterestUserGardenInterest
  extends Schema.CollectionType {
  collectionName: 'user_garden_interests';
  info: {
    singularName: 'user-garden-interest';
    pluralName: 'user-garden-interests';
    displayName: 'User Garden Interest';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    user: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    interest: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'api::interest.interest'
    >;
    garden: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'api::garden.garden'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiVolunteerDayVolunteerDay extends Schema.CollectionType {
  collectionName: 'volunteer_days';
  info: {
    singularName: 'volunteer-day';
    pluralName: 'volunteer-days';
    displayName: 'Volunteer Day';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    title: Attribute.String;
    blurb: Attribute.Text;
    garden: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'api::garden.garden'
    >;
    content: Attribute.RichText;
    startDatetime: Attribute.DateTime;
    endText: Attribute.String;
    disabled: Attribute.Boolean &
      Attribute.Required &
      Attribute.DefaultTo<false>;
    garden_tasks: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'api::garden-task.garden-task'
    >;
    interest: Attribute.String & Attribute.DefaultTo<'Everyone'>;
    sms_campaigns: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'api::sms-campaign.sms-campaign'
    >;
    slug: Attribute.String;
    confirmed: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    accessibility: Attribute.Enumeration<
      ['Public', 'Garden Members', 'Invite Only']
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiWeatherWeather extends Schema.CollectionType {
  collectionName: 'weathers';
  info: {
    singularName: 'weather';
    pluralName: 'weathers';
    displayName: 'Weather';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    weather_title: Attribute.Enumeration<['Mist', 'Rain', 'Clear', 'Clouds']>;
    description: Attribute.Text;
    temp_min: Attribute.Decimal;
    temp_max: Attribute.Decimal;
    json: Attribute.JSON;
    date: Attribute.DateTime;
    dt: Attribute.Integer;
    openweather_id: Attribute.Integer;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::weather.weather',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::weather.weather',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiWeeklyScheduleWeeklySchedule extends Schema.CollectionType {
  collectionName: 'weekly_schedules';
  info: {
    singularName: 'weekly-schedule';
    pluralName: 'weekly-schedules';
    displayName: 'Weekly Schedule';
    description: '';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    Week: Attribute.String;
    assignees: Attribute.Component<'scheduling.schedule-assignee', true>;
    recurring_task: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    publishedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface ContentTypes {
      'admin::permission': AdminPermission;
      'admin::user': AdminUser;
      'admin::role': AdminRole;
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
      'plugin::slugify.slug': PluginSlugifySlug;
      'plugin::i18n.locale': PluginI18NLocale;
      'api::application.application': ApiApplicationApplication;
      'api::blog.blog': ApiBlogBlog;
      'api::category.category': ApiCategoryCategory;
      'api::garden.garden': ApiGardenGarden;
      'api::garden-task.garden-task': ApiGardenTaskGardenTask;
      'api::instruction.instruction': ApiInstructionInstruction;
      'api::interest.interest': ApiInterestInterest;
      'api::message.message': ApiMessageMessage;
      'api::organization.organization': ApiOrganizationOrganization;
      'api::plant.plant': ApiPlantPlant;
      'api::recurring-task.recurring-task': ApiRecurringTaskRecurringTask;
      'api::scheduler.scheduler': ApiSchedulerScheduler;
      'api::sms-campaign.sms-campaign': ApiSmsCampaignSmsCampaign;
      'api::user-garden-interest.user-garden-interest': ApiUserGardenInterestUserGardenInterest;
      'api::volunteer-day.volunteer-day': ApiVolunteerDayVolunteerDay;
      'api::weather.weather': ApiWeatherWeather;
      'api::weekly-schedule.weekly-schedule': ApiWeeklyScheduleWeeklySchedule;
    }
  }
}
