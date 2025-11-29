import type { Attribute, Schema } from '@strapi/strapi';

export interface EducationCard extends Schema.Component {
  collectionName: 'components_education_cards';
  info: {
    description: '';
    displayName: 'Card';
    icon: 'store';
  };
  attributes: {
    content: Attribute.Blocks;
  };
}

export interface PlantsBenefits extends Schema.Component {
  collectionName: 'components_plants_benefits';
  info: {
    description: '';
    displayName: 'Benefits';
    icon: 'handHeart';
  };
  attributes: {
    potency: Attribute.Enumeration<
      ['minimal', 'mild', 'moderate', 'strong', 'profound']
    >;
    title: Attribute.String;
  };
}

export interface PlantsPlanting extends Schema.Component {
  collectionName: 'components_plants_plantings';
  info: {
    displayName: 'planting';
    icon: 'seed';
  };
  attributes: {
    plant_name: Attribute.String;
  };
}

export interface ProjectsImpactMetric extends Schema.Component {
  collectionName: 'components_projects_impact_metrics';
  info: {
    description: 'Measurable impact from a project';
    displayName: 'Impact Metric';
  };
  attributes: {
    icon: Attribute.String;
    label: Attribute.String & Attribute.Required;
    value: Attribute.String & Attribute.Required;
  };
}

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
    description: '';
    displayName: 'SeoInformation';
    icon: 'collapse';
  };
  attributes: {
    seodescription: Attribute.Text;
    seotitle: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'education.card': EducationCard;
      'plants.benefits': PlantsBenefits;
      'plants.planting': PlantsPlanting;
      'projects.impact-metric': ProjectsImpactMetric;
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'seo.seo-information': SeoSeoInformation;
    }
  }
}
