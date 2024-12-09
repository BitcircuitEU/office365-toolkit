import { Server } from 'socket.io';
import http from 'http';

let io: Server;

export interface MigrationStats {
  currentFolderPath: string;
  currentFileName: string;
  totalFolders: number;
  processedFolders: number;
  totalEmails: number;
  processedEmails: number;
  skippedEmails: number;
  errorEmails: number;
}

export function setupSocket(server: http.Server) {
  io = new Server(server);

  io.on('connection', (socket) => {
    console.log('A client has connected');

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
}

export function sendLog(message: string) {
  if (io) {
    io.emit('log', message);
  } else {
    console.error('Socket.IO instance not initialized');
  }
}

export function sendStats(stats: MigrationStats) {
  if (io) {
    io.emit('migrationStats', stats);
  } else {
    console.error('Socket.IO instance not initialized');
  }
}

export function sendProgress(progress: number) {
  if (io) {
    io.emit('migrationProgress', progress);
  } else {
    console.error('Socket.IO instance not initialized');
  }
}