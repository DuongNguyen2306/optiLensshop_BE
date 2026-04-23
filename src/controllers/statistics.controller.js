const statisticsService = require("../services/statistics.service");

exports.getOverviewStats = async (req, res) => {
  try {
    const result = await statisticsService.getOverviewStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const result = await statisticsService.getAdminStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getTimeSeriesStats = async (req, res) => {
  try {
    const result = await statisticsService.getTimeSeriesStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getTopProductsStats = async (req, res) => {
  try {
    const result = await statisticsService.getTopProductsStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getInventoryAlertsStats = async (req, res) => {
  try {
    const result = await statisticsService.getInventoryAlertsStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getFunnelStats = async (req, res) => {
  try {
    const result = await statisticsService.getFunnelStats(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
