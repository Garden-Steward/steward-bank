import type { Schema, Struct } from '@strapi/strapi';

export interface EducationCard extends Struct.ComponentSchema {
  collectionName: 'components_education_cards';
  info: {
    description: '';
    displayName: 'Card';
    icon: 'store';
  };
  attributes: {
    content: Schema.Attribute.Blocks;
  };
}

export interface PlantsBenefits extends Struct.ComponentSchema {
  collectionName: 'components_plants_benefits';
  info: {
    description: '';
    displayName: 'Benefits';
    icon: 'handHeart';
  };
  attributes: {
    potency: Schema.Attribute.Enumeration<
      ['minimal', 'mild', 'moderate', 'strong', 'profound']
    >;
    source_type: Schema.Attribute.JSON;
    title: Schema.Attribute.String;
  };
}

export interface PlantsPlanting extends Struct.ComponentSchema {
  collectionName: 'components_plants_plantings';
  info: {
    displayName: 'planting';
    icon: 'seed';
  };
  attributes: {
    plant_name: Schema.Attribute.String;
  };
}

export interface PlantsSources extends Struct.ComponentSchema {
  collectionName: 'components_plants_sources';
  info: {
    description: 'References and sources cited for plant data';
    displayName: 'Sources';
    icon: 'bookOpen';
  };
  attributes: {
    author: Schema.Attribute.String;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      [
        'website',
        'book',
        'academic-paper',
        'indigenous-knowledge',
        'garden-observation',
        'blog',
        'other',
      ]
    >;
    url: Schema.Attribute.String;
  };
}

export interface ProjectsImpactMetric extends Struct.ComponentSchema {
  collectionName: 'components_projects_impact_metrics';
  info: {
    description: 'Measurable impact from a project';
    displayName: 'Impact Metric';
  };
  attributes: {
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    value: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SchedulingScheduleAssignee extends Struct.ComponentSchema {
  collectionName: 'components_scheduling_schedule_assignees';
  info: {
    displayName: 'Schedule Assignee';
  };
  attributes: {
    assignee: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
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
  };
}

export interface SeoSeoInformation extends Struct.ComponentSchema {
  collectionName: 'components_seo_seo_informations';
  info: {
    description: '';
    displayName: 'SeoInformation';
    icon: 'collapse';
  };
  attributes: {
    seodescription: Schema.Attribute.Text;
    seotitle: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'education.card': EducationCard;
      'plants.benefits': PlantsBenefits;
      'plants.planting': PlantsPlanting;
      'plants.sources': PlantsSources;
      'projects.impact-metric': ProjectsImpactMetric;
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'seo.seo-information': SeoSeoInformation;
    }
  }
}
