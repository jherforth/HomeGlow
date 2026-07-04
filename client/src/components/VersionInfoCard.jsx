import React from 'react';
import {
  Paper,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Box,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';

const toShortCommit = (commitSha) => (commitSha ? commitSha.slice(0, 7) : 'Unknown');

const VersionInfoCard = ({
  label,
  version,
  commitUrl,
  commitHash,
  repository,
  tags = [],
  tagsLoading = false,
  buildTagUrl,
}) => {
  const shortHash = toShortCommit(commitHash);

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        {label}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Version
      </Typography>
      <Chip label={version || 'Unknown'} color="primary" size="small" sx={{ mb: 2 }} />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Commit
      </Typography>
      {commitUrl ? (
        <Button
          component="a"
          href={commitUrl}
          target="_blank"
          rel="noreferrer"
          variant="text"
          size="small"
          endIcon={<OpenInNew fontSize="small" />}
          sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
        >
          {shortHash}
        </Button>
      ) : (
        <Typography variant="body2" sx={{ mb: 2 }}>Unknown</Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Repository
      </Typography>
      <Button
        component="a"
        href={`https://github.com/${repository}`}
        target="_blank"
        rel="noreferrer"
        variant="text"
        size="small"
        endIcon={<OpenInNew fontSize="small" />}
        sx={{ p: 0, minWidth: 0, textTransform: 'none', mb: 2 }}
      >
        {repository}
      </Button>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Tags for this commit
      </Typography>
      {tagsLoading ? (
        <CircularProgress size={16} />
      ) : tags.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {tags.map((tagName) => {
            const tagUrl = buildTagUrl(repository, tagName);
            return tagUrl ? (
              <Chip
                key={`${label.toLowerCase()}-tag-${tagName}`}
                label={tagName}
                component="a"
                href={tagUrl}
                clickable
                target="_blank"
                rel="noreferrer"
                size="small"
              />
            ) : (
              <Chip key={`${label.toLowerCase()}-tag-${tagName}`} label={tagName} size="small" />
            );
          })}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">No tags found for this commit.</Typography>
      )}
    </Paper>
  );
};

export default VersionInfoCard;
