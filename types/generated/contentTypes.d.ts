import type { Schema, Struct } from '@strapi/strapi';

export interface AdminApiToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_tokens';
  info: {
    description: '';
    displayName: 'Api Token';
    name: 'Api Token';
    pluralName: 'api-tokens';
    singularName: 'api-token';
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
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    encryptedKey: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'read-only'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_token_permissions';
  info: {
    description: '';
    displayName: 'API Token Permission';
    name: 'API Token Permission';
    pluralName: 'api-token-permissions';
    singularName: 'api-token-permission';
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
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminPermission extends Struct.CollectionTypeSchema {
  collectionName: 'admin_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'Permission';
    pluralName: 'permissions';
    singularName: 'permission';
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
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    conditions: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::permission'> &
      Schema.Attribute.Private;
    properties: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<'manyToOne', 'admin::role'>;
    subject: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminRole extends Struct.CollectionTypeSchema {
  collectionName: 'admin_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'Role';
    pluralName: 'roles';
    singularName: 'role';
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
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::role'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<'oneToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<'manyToMany', 'admin::user'>;
  };
}

export interface AdminSession extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_sessions';
  info: {
    description: 'Session Manager storage';
    displayName: 'Session';
    name: 'Session';
    pluralName: 'sessions';
    singularName: 'session';
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
    i18n: {
      localized: false;
    };
  };
  attributes: {
    absoluteExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    childId: Schema.Attribute.String & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deviceId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    expiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::session'> &
      Schema.Attribute.Private;
    origin: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    sessionId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    status: Schema.Attribute.String & Schema.Attribute.Private;
    type: Schema.Attribute.String & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    userId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_tokens';
  info: {
    description: '';
    displayName: 'Transfer Token';
    name: 'Transfer Token';
    pluralName: 'transfer-tokens';
    singularName: 'transfer-token';
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
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferTokenPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    description: '';
    displayName: 'Transfer Token Permission';
    name: 'Transfer Token Permission';
    pluralName: 'transfer-token-permissions';
    singularName: 'transfer-token-permission';
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
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::transfer-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminUser extends Struct.CollectionTypeSchema {
  collectionName: 'admin_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'User';
    pluralName: 'users';
    singularName: 'user';
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
    blocked: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    lastname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::user'> &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    preferedLanguage: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    registrationToken: Schema.Attribute.String & Schema.Attribute.Private;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    roles: Schema.Attribute.Relation<'manyToMany', 'admin::role'> &
      Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String;
  };
}

export interface ApiApplicationApplication extends Struct.CollectionTypeSchema {
  collectionName: 'applications';
  info: {
    description: '';
    displayName: 'Application';
    pluralName: 'applications';
    singularName: 'application';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    city: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::application.application'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    primary_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    publishedAt: Schema.Attribute.DateTime;
    state: Schema.Attribute.String;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiBlogBlog extends Struct.CollectionTypeSchema {
  collectionName: 'blogs';
  info: {
    description: '';
    displayName: 'Blog';
    pluralName: 'blogs';
    singularName: 'blog';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    article_date: Schema.Attribute.Date;
    author: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    co_author: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    content: Schema.Attribute.Blocks;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    excerpt: Schema.Attribute.Text;
    hero: Schema.Attribute.Media<'images'>;
    hero_display: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::blog.blog'> &
      Schema.Attribute.Private;
    plants: Schema.Attribute.Relation<'oneToMany', 'api::plant.plant'>;
    publishedAt: Schema.Attribute.DateTime;
    seo: Schema.Attribute.Component<'seo.seo-information', false>;
    slug: Schema.Attribute.String;
    subtitle: Schema.Attribute.String;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCategoryCategory extends Struct.CollectionTypeSchema {
  collectionName: 'categories';
  info: {
    displayName: 'Category';
    pluralName: 'categories';
    singularName: 'category';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::category.category'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiGardenTaskGardenTask extends Struct.CollectionTypeSchema {
  collectionName: 'garden_tasks';
  info: {
    description: '';
    displayName: 'Garden Task';
    pluralName: 'garden-tasks';
    singularName: 'garden-task';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    complete_once: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    completed_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    instruction: Schema.Attribute.Relation<
      'oneToOne',
      'api::instruction.instruction'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::garden-task.garden-task'
    > &
      Schema.Attribute.Private;
    max_volunteers: Schema.Attribute.Integer;
    overview: Schema.Attribute.Text;
    primary_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    publishedAt: Schema.Attribute.DateTime;
    recurring_task: Schema.Attribute.Relation<
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    started_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'INITIALIZED',
        'PENDING',
        'INTERESTED',
        'STARTED',
        'FINISHED',
        'ABANDONED',
        'ISSUE',
        'SKIPPED',
        'RESOLVED',
      ]
    >;
    title: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    volunteer_day: Schema.Attribute.Relation<
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    volunteers: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiGardenGarden extends Struct.CollectionTypeSchema {
  collectionName: 'gardens';
  info: {
    description: '';
    displayName: 'Garden';
    pluralName: 'gardens';
    singularName: 'garden';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    blurb: Schema.Attribute.Text;
    boundary: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.RichText;
    hero_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    latitude: Schema.Attribute.Float;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::garden.garden'
    > &
      Schema.Attribute.Private;
    location_trackings: Schema.Attribute.Relation<
      'oneToMany',
      'api::location-tracking.location-tracking'
    >;
    longitude: Schema.Attribute.Float;
    managers: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    openweather_id: Schema.Attribute.Integer;
    organization: Schema.Attribute.Relation<
      'manyToOne',
      'api::organization.organization'
    >;
    projects: Schema.Attribute.Relation<'oneToMany', 'api::project.project'>;
    publishedAt: Schema.Attribute.DateTime;
    recurring_event_templates: Schema.Attribute.Relation<
      'oneToMany',
      'api::recurring-event-template.recurring-event-template'
    >;
    recurring_tasks: Schema.Attribute.Relation<
      'oneToMany',
      'api::recurring-task.recurring-task'
    >;
    slug: Schema.Attribute.String;
    sms_slug: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    volunteers: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    welcome_email_body: Schema.Attribute.RichText;
    welcome_email_subject: Schema.Attribute.String;
    welcome_text: Schema.Attribute.Text;
  };
}

export interface ApiInstructionInstruction extends Struct.CollectionTypeSchema {
  collectionName: 'instructions';
  info: {
    description: '';
    displayName: 'Instruction';
    pluralName: 'instructions';
    singularName: 'instruction';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    accept_required: Schema.Attribute.Boolean;
    affirm_button_title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Accept'>;
    affirm_explain: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<"I understand this task's requirements and I am capable. I accept this task.">;
    card: Schema.Attribute.Component<'education.card', true>;
    content: Schema.Attribute.Blocks;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::instruction.instruction'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.String;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiInterestInterest extends Struct.CollectionTypeSchema {
  collectionName: 'interests';
  info: {
    description: '';
    displayName: 'Interest';
    pluralName: 'interests';
    singularName: 'interest';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gardens: Schema.Attribute.Relation<'oneToMany', 'api::garden.garden'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::interest.interest'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    tag: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiLocationTrackingLocationTracking
  extends Struct.CollectionTypeSchema {
  collectionName: 'location_trackings';
  info: {
    description: '';
    displayName: 'Location Tracking';
    pluralName: 'location-trackings';
    singularName: 'location-tracking';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    analysis: Schema.Attribute.Text;
    confidence: Schema.Attribute.Enumeration<
      ['high', 'medium', 'low', 'unknown', 'unverified']
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    garden: Schema.Attribute.Relation<'manyToOne', 'api::garden.garden'>;
    garden_assignment_status: Schema.Attribute.Enumeration<
      ['unassigned', 'pending_confirmation', 'confirmed', 'declined']
    > &
      Schema.Attribute.DefaultTo<'unassigned'>;
    is_plant: Schema.Attribute.Boolean;
    label: Schema.Attribute.String;
    last_verified: Schema.Attribute.DateTime;
    latitude: Schema.Attribute.Float;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::location-tracking.location-tracking'
    > &
      Schema.Attribute.Private;
    location_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    longitude: Schema.Attribute.Float;
    map_layer: Schema.Attribute.Enumeration<
      ['fruit_tree', 'pollinator', 'garden', 'other']
    >;
    plant: Schema.Attribute.Relation<'oneToOne', 'api::plant.plant'>;
    plant_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    planted_date: Schema.Attribute.Date;
    publishedAt: Schema.Attribute.DateTime;
    suggested_distance_meters: Schema.Attribute.Float;
    suggested_match_method: Schema.Attribute.Enumeration<
      ['inside_polygon', 'within_radius']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiMessageMessage extends Struct.CollectionTypeSchema {
  collectionName: 'messages';
  info: {
    description: '';
    displayName: 'Message';
    pluralName: 'messages';
    singularName: 'message';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    body: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    event: Schema.Attribute.Relation<
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    garden_task: Schema.Attribute.Relation<
      'oneToOne',
      'api::garden-task.garden-task'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::message.message'
    > &
      Schema.Attribute.Private;
    meta_data: Schema.Attribute.JSON;
    previous: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<
      [
        'question',
        'followup',
        'reply',
        'notification',
        'complete',
        'registration',
        'error',
      ]
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiOrganizationOrganization
  extends Struct.CollectionTypeSchema {
  collectionName: 'organizations';
  info: {
    description: '';
    displayName: 'Organization';
    pluralName: 'organizations';
    singularName: 'organization';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    gardens: Schema.Attribute.Relation<'oneToMany', 'api::garden.garden'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::organization.organization'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Schema.Attribute.DateTime;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String;
    venmo_handle: Schema.Attribute.String;
  };
}

export interface ApiPlantPlant extends Struct.CollectionTypeSchema {
  collectionName: 'plants';
  info: {
    description: '';
    displayName: 'Plant';
    pluralName: 'plants';
    singularName: 'plant';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    Benefits: Schema.Attribute.Component<'plants.benefits', true>;
    clipart: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    images: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    latin: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::plant.plant'> &
      Schema.Attribute.Private;
    magic: Schema.Attribute.RichText;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.String;
    sun_detail: Schema.Attribute.Text;
    title: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<
      ['annual', 'perennial', 'herb', 'tree', 'shrub', 'wildflower']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    water_detail: Schema.Attribute.Text;
  };
}

export interface ApiProjectProject extends Struct.CollectionTypeSchema {
  collectionName: 'projects';
  info: {
    description: 'Garden projects, milestones, and community initiatives';
    displayName: 'Project';
    pluralName: 'projects';
    singularName: 'project';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      ['Infrastructure', 'Art', 'Event', 'Education', 'Planting', 'Community']
    > &
      Schema.Attribute.DefaultTo<'Community'>;
    created_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date_end: Schema.Attribute.Date;
    date_start: Schema.Attribute.Date;
    description: Schema.Attribute.RichText;
    featured: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    featured_gallery: Schema.Attribute.Media<'images', true>;
    garden: Schema.Attribute.Relation<'manyToOne', 'api::garden.garden'>;
    hero_image: Schema.Attribute.Media<'images'>;
    hours_contributed: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    impact_metrics: Schema.Attribute.Component<'projects.impact-metric', true>;
    interested: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    latitude: Schema.Attribute.Float;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::project.project'
    > &
      Schema.Attribute.Private;
    longitude: Schema.Attribute.Float;
    managers: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    photo_album_id: Schema.Attribute.String;
    photo_album_url: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    related_events: Schema.Attribute.Relation<
      'manyToMany',
      'api::volunteer-day.volunteer-day'
    >;
    short_description: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 350;
      }>;
    slug: Schema.Attribute.String & Schema.Attribute.Unique;
    status: Schema.Attribute.Enumeration<
      ['CREATED', 'APPROVED', 'REJECTED', 'COMPLETED', 'ARCHIVED']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'CREATED'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    volunteer_count: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
  };
}

export interface ApiRecurringEventTemplateRecurringEventTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'recurring_event_templates';
  info: {
    description: 'Templates for auto-generating monthly recurring volunteer events';
    displayName: 'Recurring Event Template';
    pluralName: 'recurring-event-templates';
    singularName: 'recurring-event-template';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    accessibility: Schema.Attribute.Enumeration<
      ['Public', 'Garden Members', 'Invite Only']
    > &
      Schema.Attribute.DefaultTo<'Public'>;
    blurb: Schema.Attribute.Text;
    content: Schema.Attribute.RichText;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    day_of_month: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 31;
          min: 1;
        },
        number
      >;
    end_text: Schema.Attribute.String;
    first_occurrence_date: Schema.Attribute.Date & Schema.Attribute.Required;
    garden: Schema.Attribute.Relation<'manyToOne', 'api::garden.garden'>;
    generated_events: Schema.Attribute.Relation<
      'oneToMany',
      'api::volunteer-day.volunteer-day'
    >;
    hero_image: Schema.Attribute.Media<'images'>;
    interest: Schema.Attribute.String & Schema.Attribute.DefaultTo<'Everyone'>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::recurring-event-template.recurring-event-template'
    > &
      Schema.Attribute.Private;
    max_future_instances: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 12;
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<3>;
    naming_convention: Schema.Attribute.Enumeration<
      ['title_only', 'title_month', 'title_day_of_month', 'title_nth_weekday']
    > &
      Schema.Attribute.DefaultTo<'title_only'>;
    nth_occurrence: Schema.Attribute.Enumeration<
      ['first', 'second', 'third', 'fourth', 'last']
    >;
    publishedAt: Schema.Attribute.DateTime;
    recurrence_type: Schema.Attribute.Enumeration<
      ['day_of_month', 'nth_weekday']
    > &
      Schema.Attribute.Required;
    start_time: Schema.Attribute.Time;
    title_template: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      ['general', 'land_work', 'cleanup', 'art', 'workshop']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    weekday: Schema.Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]
    >;
  };
}

export interface ApiRecurringTaskRecurringTask
  extends Struct.CollectionTypeSchema {
  collectionName: 'recurring_tasks';
  info: {
    description: '';
    displayName: 'Recurring Task';
    pluralName: 'recurring-tasks';
    singularName: 'recurring-task';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    complete_once: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    garden: Schema.Attribute.Relation<'manyToOne', 'api::garden.garden'>;
    instruction: Schema.Attribute.Relation<
      'oneToOne',
      'api::instruction.instruction'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::recurring-task.recurring-task'
    > &
      Schema.Attribute.Private;
    max_volunteers: Schema.Attribute.Integer;
    overview: Schema.Attribute.Text;
    primary_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    publishedAt: Schema.Attribute.DateTime;
    scheduler_type: Schema.Attribute.Enumeration<
      ['No Schedule', 'Daily Primary', 'Weekly Shuffle']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'No Schedule'>;
    schedulers: Schema.Attribute.Relation<
      'oneToMany',
      'api::scheduler.scheduler'
    >;
    title: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    week_start_date: Schema.Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]
    > &
      Schema.Attribute.DefaultTo<'Sunday'>;
  };
}

export interface ApiSchedulerScheduler extends Struct.CollectionTypeSchema {
  collectionName: 'schedulers';
  info: {
    description: '';
    displayName: 'Scheduler';
    pluralName: 'schedulers';
    singularName: 'scheduler';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    backup_volunteers: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    day: Schema.Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]
    >;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::scheduler.scheduler'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    recurring_task: Schema.Attribute.Relation<
      'manyToOne',
      'api::recurring-task.recurring-task'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    volunteer: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiSmsCampaignSmsCampaign extends Struct.CollectionTypeSchema {
  collectionName: 'sms_campaigns';
  info: {
    description: '';
    displayName: 'SMS Campaign';
    pluralName: 'sms-campaigns';
    singularName: 'sms-campaign';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    alert: Schema.Attribute.Boolean;
    body: Schema.Attribute.Text;
    closes_at: Schema.Attribute.DateTime;
    confirmed: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    denied: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sms-campaign.sms-campaign'
    > &
      Schema.Attribute.Private;
    option_a: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    option_b: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    option_c: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    option_d: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    poll_options: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    reminder_sent: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    send_reminder: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    sender: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    sent: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    type: Schema.Attribute.Enumeration<
      ['basic', 'rsvp', 'survey', 'volunteer-day', 'recurring-task', 'poll']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    volunteer_day: Schema.Attribute.Relation<
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    winner: Schema.Attribute.String;
  };
}

export interface ApiUserGardenInterestUserGardenInterest
  extends Struct.CollectionTypeSchema {
  collectionName: 'user_garden_interests';
  info: {
    description: '';
    displayName: 'User Garden Interest';
    pluralName: 'user-garden-interests';
    singularName: 'user-garden-interest';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    interest: Schema.Attribute.Relation<'oneToOne', 'api::interest.interest'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::user-garden-interest.user-garden-interest'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiVolunteerDayVolunteerDay
  extends Struct.CollectionTypeSchema {
  collectionName: 'volunteer_days';
  info: {
    description: '';
    displayName: 'Volunteer Day';
    pluralName: 'volunteer-days';
    singularName: 'volunteer-day';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    accessibility: Schema.Attribute.Enumeration<
      ['Public', 'Garden Members', 'Invite Only']
    > &
      Schema.Attribute.DefaultTo<'Public'>;
    blurb: Schema.Attribute.Text;
    confirmed: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    content: Schema.Attribute.RichText;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    disabled: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<false>;
    endText: Schema.Attribute.String;
    featured_gallery: Schema.Attribute.Media<'images', true>;
    garden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    garden_tasks: Schema.Attribute.Relation<
      'oneToMany',
      'api::garden-task.garden-task'
    >;
    hero_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    interest: Schema.Attribute.String & Schema.Attribute.DefaultTo<'Everyone'>;
    is_recurring_instance: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::volunteer-day.volunteer-day'
    > &
      Schema.Attribute.Private;
    messages: Schema.Attribute.Relation<'oneToMany', 'api::message.message'>;
    partiful_link: Schema.Attribute.String;
    photo_album_id: Schema.Attribute.String;
    photo_album_url: Schema.Attribute.String;
    planting: Schema.Attribute.Component<'plants.planting', true>;
    publishedAt: Schema.Attribute.DateTime;
    recurring_template: Schema.Attribute.Relation<
      'manyToOne',
      'api::recurring-event-template.recurring-event-template'
    >;
    slug: Schema.Attribute.String;
    sms_campaigns: Schema.Attribute.Relation<
      'oneToMany',
      'api::sms-campaign.sms-campaign'
    >;
    smsLink: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    startDatetime: Schema.Attribute.DateTime;
    title: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<
      ['general', 'land_work', 'cleanup', 'art', 'workshop']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiWeatherWeather extends Struct.CollectionTypeSchema {
  collectionName: 'weathers';
  info: {
    displayName: 'Weather';
    pluralName: 'weathers';
    singularName: 'weather';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.DateTime;
    description: Schema.Attribute.Text;
    dt: Schema.Attribute.Integer;
    json: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::weather.weather'
    > &
      Schema.Attribute.Private;
    openweather_id: Schema.Attribute.Integer;
    publishedAt: Schema.Attribute.DateTime;
    temp_max: Schema.Attribute.Decimal;
    temp_min: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    weather_title: Schema.Attribute.Enumeration<
      ['Mist', 'Rain', 'Clear', 'Clouds']
    >;
  };
}

export interface ApiWeeklyScheduleWeeklySchedule
  extends Struct.CollectionTypeSchema {
  collectionName: 'weekly_schedules';
  info: {
    description: '';
    displayName: 'Weekly Schedule';
    pluralName: 'weekly-schedules';
    singularName: 'weekly-schedule';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    assignees: Schema.Attribute.Component<'scheduling.schedule-assignee', true>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::weekly-schedule.weekly-schedule'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    recurring_task: Schema.Attribute.Relation<
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    Week: Schema.Attribute.String;
  };
}

export interface PluginContentReleasesRelease
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_releases';
  info: {
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
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
    actions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    releasedAt: Schema.Attribute.DateTime;
    scheduledAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Schema.Attribute.Required;
    timezone: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_release_actions';
  info: {
    displayName: 'Release Action';
    pluralName: 'release-actions';
    singularName: 'release-action';
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
    contentType: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entryDocumentId: Schema.Attribute.String;
    isEntryValid: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    release: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::content-releases.release'
    >;
    type: Schema.Attribute.Enumeration<['publish', 'unpublish']> &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginI18NLocale extends Struct.CollectionTypeSchema {
  collectionName: 'i18n_locale';
  info: {
    collectionName: 'locales';
    description: '';
    displayName: 'Locale';
    pluralName: 'locales';
    singularName: 'locale';
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
    code: Schema.Attribute.String & Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::i18n.locale'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMax<
        {
          max: 50;
          min: 1;
        },
        number
      >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflow
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows';
  info: {
    description: '';
    displayName: 'Workflow';
    name: 'Workflow';
    pluralName: 'workflows';
    singularName: 'workflow';
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
    contentTypes: Schema.Attribute.JSON &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'[]'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    stageRequiredToPublish: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::review-workflows.workflow-stage'
    >;
    stages: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflowStage
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows_stages';
  info: {
    description: '';
    displayName: 'Stages';
    name: 'Workflow Stage';
    pluralName: 'workflow-stages';
    singularName: 'workflow-stage';
  };
  options: {
    draftAndPublish: false;
    version: '1.1.0';
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
    color: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#4945FF'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    permissions: Schema.Attribute.Relation<'manyToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    workflow: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::review-workflows.workflow'
    >;
  };
}

export interface PluginUploadFile extends Struct.CollectionTypeSchema {
  collectionName: 'files';
  info: {
    description: '';
    displayName: 'File';
    pluralName: 'files';
    singularName: 'file';
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
    alternativeText: Schema.Attribute.Text;
    caption: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    ext: Schema.Attribute.String;
    focalPoint: Schema.Attribute.JSON;
    folder: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'> &
      Schema.Attribute.Private;
    folderPath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    formats: Schema.Attribute.JSON;
    hash: Schema.Attribute.String & Schema.Attribute.Required;
    height: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.file'
    > &
      Schema.Attribute.Private;
    mime: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    previewUrl: Schema.Attribute.Text;
    provider: Schema.Attribute.String & Schema.Attribute.Required;
    provider_metadata: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    related: Schema.Attribute.Relation<'morphToMany'>;
    size: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.Text & Schema.Attribute.Required;
    width: Schema.Attribute.Integer;
  };
}

export interface PluginUploadFolder extends Struct.CollectionTypeSchema {
  collectionName: 'upload_folders';
  info: {
    displayName: 'Folder';
    pluralName: 'folders';
    singularName: 'folder';
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
    children: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.folder'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    files: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.file'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.folder'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    parent: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'>;
    path: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    pathId: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'permission';
    pluralName: 'permissions';
    singularName: 'permission';
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
    action: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'role';
    pluralName: 'roles';
    singularName: 'role';
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
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.String & Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface PluginUsersPermissionsUser
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'user';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    activeGarden: Schema.Attribute.Relation<'oneToOne', 'api::garden.garden'>;
    automated_emails_sent: Schema.Attribute.JSON;
    bio: Schema.Attribute.Text;
    blocked: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    chatId: Schema.Attribute.BigInteger;
    color: Schema.Attribute.Enumeration<
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
        'slate',
      ]
    >;
    confirmationToken: Schema.Attribute.String & Schema.Attribute.Private;
    confirmed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    email_confirmed: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    email_verification_expires: Schema.Attribute.DateTime &
      Schema.Attribute.Private;
    email_verification_token: Schema.Attribute.String &
      Schema.Attribute.Private;
    firstName: Schema.Attribute.String;
    gardens: Schema.Attribute.Relation<'manyToMany', 'api::garden.garden'>;
    instructions: Schema.Attribute.Relation<
      'oneToMany',
      'api::instruction.instruction'
    >;
    last_vacation_check_sent: Schema.Attribute.DateTime;
    lastName: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    > &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    paused: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    paused_at: Schema.Attribute.DateTime;
    phoneNumber: Schema.Attribute.String;
    profilePhoto: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    provider: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    status: Schema.Attribute.Enumeration<
      ['INTERESTED', 'VOLUNTEER', 'PROFESSIONAL', 'INACTIVE']
    >;
    u_g_interests: Schema.Attribute.Relation<
      'oneToMany',
      'api::user-garden-interest.user-garden-interest'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ContentTypeSchemas {
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::permission': AdminPermission;
      'admin::role': AdminRole;
      'admin::session': AdminSession;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'admin::user': AdminUser;
      'api::application.application': ApiApplicationApplication;
      'api::blog.blog': ApiBlogBlog;
      'api::category.category': ApiCategoryCategory;
      'api::garden-task.garden-task': ApiGardenTaskGardenTask;
      'api::garden.garden': ApiGardenGarden;
      'api::instruction.instruction': ApiInstructionInstruction;
      'api::interest.interest': ApiInterestInterest;
      'api::location-tracking.location-tracking': ApiLocationTrackingLocationTracking;
      'api::message.message': ApiMessageMessage;
      'api::organization.organization': ApiOrganizationOrganization;
      'api::plant.plant': ApiPlantPlant;
      'api::project.project': ApiProjectProject;
      'api::recurring-event-template.recurring-event-template': ApiRecurringEventTemplateRecurringEventTemplate;
      'api::recurring-task.recurring-task': ApiRecurringTaskRecurringTask;
      'api::scheduler.scheduler': ApiSchedulerScheduler;
      'api::sms-campaign.sms-campaign': ApiSmsCampaignSmsCampaign;
      'api::user-garden-interest.user-garden-interest': ApiUserGardenInterestUserGardenInterest;
      'api::volunteer-day.volunteer-day': ApiVolunteerDayVolunteerDay;
      'api::weather.weather': ApiWeatherWeather;
      'api::weekly-schedule.weekly-schedule': ApiWeeklyScheduleWeeklySchedule;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::review-workflows.workflow': PluginReviewWorkflowsWorkflow;
      'plugin::review-workflows.workflow-stage': PluginReviewWorkflowsWorkflowStage;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
