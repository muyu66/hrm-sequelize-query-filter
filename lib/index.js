'use strict';

const _ = require('lodash');
const { Op } = require('sequelize');
const moment = require('moment');

module.exports.arrayQuery = function arrayQuery(
  querySource,
  filters,
  option
) {
  const query = _.clone(querySource);

  if (!filters) {
    return query;
  }
  if (!Array.isArray(filters)) {
    filters = [filters];
  }
  const req = {};
  for (let filter of filters) {
    if (typeof filter === 'object') {
      query[filter.as] = _.clone(query[filter.source]);
      delete query[filter.source];
      filter = filter.as;
    }
    if (typeof filter !== 'string') continue;
    if (!isNo(query[filter])) {
      // 解包之前, 特殊处理
      if (option && option.mergeDeptIds) arrayQueryIntersectDeptId(query, option.mergeDeptIds);
      if (option && option.recursiveDeptIds) arrayQueryRecursiveDeptId(query, option.recursiveDeptIds);

      // 解包
      arrayQueryUnwrap(req, query, filter);

      // 特殊解析
      arrayQueryUserState(req, query, filter);
      arrayQueryValue(req, query, filter);
      arrayQueryDate(req, query, filter);
    }
  }
  return req;
};

function arrayQueryIntersectDeptId(query, deptIds) {
  if (!_.isEmpty(deptIds)) {
    if (isYesEmpty(query.deptId)) {
      const queryDeptIds = _(query.deptId).split(',').map(v => v).value();
      const deptId = _.intersection(queryDeptIds, deptIds).join(',');
      _.assign(query, { deptId });
    } else {
      _.assign(query, { deptId: deptIds.join(',') });
    }
  }
}

function arrayQueryRecursiveDeptId(query, deptIds) {
  // 后端强制指定
  query.deptIdRecursive = '1';
  if (Number(query.deptIdRecursive) === 1) {
    return arrayQueryMergeDeptId(query, deptIds);
  }
}

function arrayQueryMergeDeptId(query, deptIds) {
  if (!_.isEmpty(deptIds)) {
    if (isYesEmpty(query.deptId)) {
      const queryDeptIds = _(query.deptId).split(',').map(v => v).value();
      const deptId = _.union(queryDeptIds, deptIds).join(',');
      _.assign(query, { deptId });
    }
  }
}

function isNo(value, option = { ignoreEmptyString: true }) {
  if (_.isUndefined(value) || _.isNull(value) || _.isNaN(value)) return true;
  if (option.ignoreEmptyString === false && _.trim(value) === '') return true;
  return false;
}

function isYesEmpty(value) {
  return !isNoEmpty(value);
}

function isNoEmpty(value) {
  if (_.isUndefined(value) || _.isNull(value) || _.isNaN(value) || _.trim(value) === '') return true;
  return false;
}

function arrayQueryUnwrap(req, query, filter) {
  // 是字符串数组形式
  if (_.split(query[filter], ',').length >= 2) {
    // 判断是否需要直接追加 SQL 支持
    if (filter === 'userState' || filter.slice(0, 10) === 'userResume') {
      req[filter] = _.split(query[filter], ',');
    } else {
      req[filter] = { [Op.in]: _.split(query[filter], ',') };
    }
  } else {
    req[filter] = query[filter];
  }
}

function arrayQueryValue(req, query, filterName) {
  if (filterName === 'value') {
    _.assign(req, {
      $or: [
        {
          name: {
            [Op.like]: `${query[filterName]}%`
          }
        },
        {
          namePinyin: {
            [Op.like]: `${query[filterName]}%`
          }
        },
        {
          namePinyinShort: {
            [Op.like]: `${query[filterName]}%`
          }
        },
        {
          jobNumber: {
            [Op.like]: `${query[filterName]}`
          }
        },
        {
          phone: {
            [Op.like]: `${query[filterName]}`
          }
        }
      ]
    });
    delete req.value;
  }
}

function arrayQueryUserState(req, query, filterName) {
  if (filterName === 'userState') {
    if (!_.isArray(req[filterName])) req[filterName] = [req[filterName]];
    const whereUserState = [];

    for (const item of req[filterName]) {
      switch (Number(item)) {
        // 待入职
        case 1:
          whereUserState.push({
            entryDate: { [Op.gt]: moment().toISOString() }
          });
          break;
        // 试用期
        case 2:
          whereUserState.push({
            entryDate: { [Op.lte]: moment().toISOString() },
            $and: {
              [Op.or]: [
                { positiveDate: { [Op.gt]: moment().toISOString() } },
                { positiveDate: { [Op.eq]: null } }
              ]
            }
          });
          break;
        // 正式员工
        case 3:
          whereUserState.push({
            positiveDate: { [Op.lte]: moment().toISOString() }
          });
          break;
      }
    }
    _.assign(req, {
      [Op.or]: whereUserState
    });
    delete req.userState;
  }
}

function arrayQueryDate(req, query, filterName) {
  // 转换日期格式
  try {
    if (_.has(JSON.parse(query[filterName]), 'begin')) {
      const json = JSON.parse(query[filterName]);
      if (_.isObject(json) && json.begin !== undefined && json.end !== undefined) {
        // 针对 日期对象参数 的特殊化处理
        const { begin, end } = convertBeginEnd(json.begin, json.end);
        req[filterName] = {
          [Op.and]: [
            { [Op.gte]: begin },
            { [Op.lte]: end }
          ]
        };
      }
    }
  } catch (e) { }
}

function convertBeginEnd(begin, end) {
  if (isNoEmpty(begin)) {
    begin = convertToDb(moment(1).toISOString());
  } else {
    begin = convertToDb(moment(begin).toISOString());
  }
  if (isNoEmpty(end)) {
    end = convertToDb(moment().toISOString());
  } else {
    end = convertToDb(moment(end).toISOString());
  }

  return {
    begin, end
  };
}

function convertToDb(date, sourceFormat, targetFormat = 'YYYY-MM-DD HH:mm:ss') {
  // 智能识别类型
  if (typeof date === 'string') {
    if (date.length === 6) sourceFormat = 'YYYYMM';
    if (date.length === 8) sourceFormat = 'YYYYMMDD';
  }

  return moment(date || undefined, sourceFormat).format(targetFormat);
}