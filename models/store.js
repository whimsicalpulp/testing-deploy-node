const mongoose = require('mongoose');
// tell mongoose that the promise to use is global.Promise
// we're using the built in ES6 promise
// global is like window, a global variable. Don't put stuff on it though.
mongoose.Promise = global.Promise;
// allow us to make url friendly names for our slugs. A slug is a way to 
// represent a title with a limited charset (only lowercase letter and dash) 
// to be inserted in the url.
const slug = require('slugs');

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true, // trip the white space before and after 
    required: 'Please enter a store name!'
  },
  slug: String, // auto generated whenever somebody saves
  description: {
    type: String,
    trim: true
  },
  tags: [String],
  created: {
    type: Date,
    default: Date.now
  },
  location: {
    type: {
      type: String,
      default: 'Point'
    },
    coordinates: [{
      type: Number,
      required: 'You must supply coordinates!'
    }],
    address: {
      type: String,
      required: 'You must supply an address!'
    }
  },
  photo: String,
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: 'You must supply an author'
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Define our indexes
storeSchema.index({
  name: 'text',
  description: 'text'
});

storeSchema.index({ location: '2dsphere' });

// before somebody saves a store, generate the slug
storeSchema.pre('save', async function(next) {
  // only need to generate a slug if the name changes
  if (!this.isModified('name')) {
    next(); // skip it
    return; // stop this function from running
  }
  this.slug = slug(this.name);
  // find other stores that have a slug of wes, wes-1, wes-2, etc.
  const slugRegEx = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 'i');
  const storesWithSlug = await this.constructor.find({ slug: slugRegEx });
  if(storesWithSlug.length) {
    this.slug = `${this.slug}-${storesWithSlug.length + 1}`;
  }
  next(); // similar to middleware, call next()
  // TODO make more resiliant so slugs are unique
});

storeSchema.statics.getTagsList = function() {
  return this.aggregate([
    { $unwind: '$tags'},
    { $group: { _id: '$tags', count: { $sum: 1 } }},
    { $sort: { count: -1 }}
  ]);
}

storeSchema.statics.getTopStores = function() {
  return this.aggregate([
    // Look up stores and populate their reviews
    { $lookup: {
      from: 'reviews', localField: '_id', foreignField: 'store', as: 'reviews' }
    },
    // Filster for only items that have 2 or more reviews
    { $match: { 'reviews.1': { $exists: true } }},
    // Add the average reviews field
    { $project: {
      photo: '$$ROOT.photo',
      name: '$$ROOT.name',
      reviews: '$$ROOT.reviews',
      slug: '$$ROOT.slug',
      averageRating: { $avg: '$reviews.rating' }
    }},
    // Sort it by our new field, highest reviews first
    { $sort: { averageRating: -1 }},
    // Limit to at most 10
    { $limit: 10 }
  ]);
}
// find reviews where the stores _id === reviews store property
storeSchema.virtual('reviews', {
  ref: 'Review', // what model to link?
  localField: '_id', // which field on the store?
  foreignField: 'store' // which field on the review?
});

function autopopulate(next) {
  this.populate('reviews');
  next();
}

storeSchema.pre('find', autopopulate);
storeSchema.pre('findOne', autopopulate);

module.exports = mongoose.model('Store', storeSchema);



