import type { Schema, Attribute } from '@strapi/strapi';

export interface SchedulingScheduleAssignee extends Schema.Component {
  collectionName: 'components_scheduling_schedule_assignees';
  info: {
    displayName: 'Schedule Assignee';
  };
  attributes: {
    assignee: Attribute.Relation<
      'scheduling.schedule-assignee',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
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
  };
}

export interface SeoSeoInformation extends Schema.Component {
  collectionName: 'components_seo_seo_informations';
  info: {
    displayName: 'SeoInformation';
    icon: 'collapse';
    description: '';
  };
  attributes: {
    seotitle: Attribute.String;
    seodescription: Attribute.Text;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'seo.seo-information': SeoSeoInformation;
    }
  }
}
